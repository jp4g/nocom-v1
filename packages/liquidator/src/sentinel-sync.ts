import type { SentinelStorage } from './storage';
import type { AztecClient, PositionData } from './aztec-client';
import type { LiquidationExecutor } from './liquidation-executor';
import type { CollateralPosition, EscrowAccount, Price } from './utils';
import type { Logger } from 'pino';
import { math } from '@nocom-v1/contracts/utils';
import {
  HEALTH_FACTOR_THRESHOLD,
  ZCASH_LIQUIDATION_THRESHOLD,
  USDC_LIQUIDATION_THRESHOLD,
  EPOCH_LENGTH,
  BORROW_INTEREST,
  PRICE_BASE,
} from '@nocom-v1/contracts/constants';

export interface SentinelSyncConfig {
  syncInterval: number; // milliseconds
}

interface PriceCache {
  [symbol: string]: {
    price: bigint; // USD price scaled by PRICE_BASE (10000 = $1.00)
    updatedAt: number; // timestamp
  };
}

/**
 * Sentinel Synchronization Service
 * Handles periodic syncing of escrow positions and executes liquidations directly
 * Receives price updates via direct callback from PriceMonitor (no HTTP)
 */
export class SentinelSyncService {
  private storage: SentinelStorage;
  private aztecClient: AztecClient;
  private liquidationExecutor: LiquidationExecutor;
  private config: SentinelSyncConfig;
  private logger: Logger;
  private intervalId?: Timer;
  private isRunning: boolean = false;

  // Price cache - updated via direct callback from PriceMonitor
  private priceCache: PriceCache = {};

  constructor(
    storage: SentinelStorage,
    aztecClient: AztecClient,
    liquidationExecutor: LiquidationExecutor,
    config: SentinelSyncConfig,
    logger: Logger
  ) {
    this.storage = storage;
    this.aztecClient = aztecClient;
    this.liquidationExecutor = liquidationExecutor;
    this.config = config;
    this.logger = logger;
  }

  /**
   * Register an escrow with the Aztec client for syncing
   */
  async registerEscrowForSync(escrow: EscrowAccount): Promise<void> {
    if (!this.aztecClient.isInitialized()) {
      this.logger.warn({ address: escrow.address }, 'Aztec client not initialized, will register on next sync');
      return;
    }

    try {
      await this.aztecClient.registerEscrow(
        escrow.address,
        escrow.type,
        escrow.instance,
        escrow.secretKey
      );
      this.logger.info({ address: escrow.address, type: escrow.type }, 'Escrow registered with Aztec client');
    } catch (error) {
      this.logger.error({ error, address: escrow.address, type: escrow.type }, 'Failed to register escrow with Aztec client');
    }
  }

  /**
   * Start the synchronization loop
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Sentinel sync service is already running');
      return;
    }

    this.logger.info(
      { interval: this.config.syncInterval },
      'Starting sentinel sync service'
    );

    this.isRunning = true;

    // Run immediately then on interval
    this.runSyncCycle();

    this.intervalId = setInterval(() => {
      this.runSyncCycle();
    }, this.config.syncInterval);
  }

  /**
   * Stop the synchronization loop
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    this.isRunning = false;
    this.logger.info('Sentinel sync service stopped');
  }

  /**
   * Handle a price update pushed from PriceMonitor (direct callback, no HTTP)
   * @param asset - asset symbol
   * @param newPrice - price in USD as a float (e.g., 45.23 for $45.23)
   */
  async handlePriceUpdate(asset: string, newPrice: number): Promise<void> {
    const symbol = asset.toUpperCase();
    const previousPriceBigint = this.priceCache[symbol]?.price;
    const previousPriceUSD = previousPriceBigint ? Number(previousPriceBigint) / Number(PRICE_BASE) : undefined;

    // Convert float price to BigInt scaled by PRICE_BASE
    const newPriceBigint = BigInt(Math.round(newPrice * Number(PRICE_BASE)));

    // Update cache
    this.priceCache[symbol] = {
      price: newPriceBigint,
      updatedAt: Date.now(),
    };

    this.logger.info(
      { asset: symbol, previousPriceUSD, newPriceUSD: newPrice, newPriceBigint: newPriceBigint.toString() },
      'Price update received'
    );

    // Check health for escrows affected by this price change
    await this.checkHealthForAffectedEscrows(symbol);
  }

  /**
   * Set initial prices (called during startup)
   */
  setInitialPrices(prices: Price[]): void {
    const now = Date.now();
    for (const price of prices) {
      const symbol = price.asset.toUpperCase();
      // Convert float price to BigInt scaled by PRICE_BASE
      const priceBigint = BigInt(Math.round(price.price * Number(PRICE_BASE)));
      this.priceCache[symbol] = {
        price: priceBigint,
        updatedAt: now,
      };
    }

    this.logger.info(
      { prices: Object.keys(this.priceCache).map(s => `${s}: $${Number(this.priceCache[s]!.price) / Number(PRICE_BASE)}`) },
      'Initial prices set'
    );
  }

  /**
   * Check health for all escrows that use the given asset as collateral or debt
   */
  private async checkHealthForAffectedEscrows(changedAsset: string): Promise<void> {
    if (!this.aztecClient.isInitialized()) {
      this.logger.debug('Aztec client not initialized, skipping health check');
      return;
    }

    const escrows = this.storage.getAllEscrows();
    const changedSymbol = changedAsset.toUpperCase();

    const affectedEscrows = escrows.filter(e => {
      const collateralSymbol = this.aztecClient.getTokenSymbol(e.collateralToken);
      const debtSymbol = this.aztecClient.getTokenSymbol(e.debtToken);
      return collateralSymbol === changedSymbol || debtSymbol === changedSymbol;
    });

    if (affectedEscrows.length === 0) {
      this.logger.debug({ asset: changedAsset }, 'No escrows affected by price change');
      return;
    }

    this.logger.info(
      { asset: changedAsset, affectedCount: affectedEscrows.length },
      'Checking health for escrows affected by price change'
    );

    for (const escrow of affectedEscrows) {
      try {
        await this.checkEscrowHealth(escrow);
      } catch (error) {
        this.logger.error({ error, escrow: escrow.address }, 'Error checking escrow health');
      }
    }
  }

  /**
   * Check health for a single escrow using cached prices
   */
  private async checkEscrowHealth(escrow: EscrowAccount): Promise<void> {
    const collateralSymbol = this.aztecClient.getTokenSymbol(escrow.collateralToken);
    const debtSymbol = this.aztecClient.getTokenSymbol(escrow.debtToken);

    if (!collateralSymbol || !debtSymbol) {
      this.logger.warn(
        { escrow: escrow.address, collateralToken: escrow.collateralToken, debtToken: escrow.debtToken },
        'Unknown token address - cannot map to symbol'
      );
      return;
    }

    const collateralPriceData = this.priceCache[collateralSymbol];
    const debtPriceData = this.priceCache[debtSymbol];

    if (!collateralPriceData || !debtPriceData) {
      this.logger.warn(
        { escrow: escrow.address, collateralSymbol, debtSymbol },
        'Missing cached price for health check'
      );
      return;
    }

    // Ensure escrow is registered
    if (!this.aztecClient.getRegisteredEscrow(escrow.address)) {
      await this.aztecClient.registerEscrow(
        escrow.address,
        escrow.type,
        escrow.instance,
        escrow.secretKey
      );
    }

    // Fetch current position data
    const positionData = await this.aztecClient.getPositionData(
      escrow.address,
      escrow.poolAddress,
      escrow.type
    );

    // Calculate total debt with interest
    const currentEpoch = BigInt(Math.floor(Date.now() / 1000 / EPOCH_LENGTH));
    const interest = math.calculateInterest(
      positionData.debtAmount,
      positionData.debtEpoch,
      currentEpoch,
      BigInt(EPOCH_LENGTH),
      BORROW_INTEREST
    );
    const totalDebt = positionData.debtAmount + interest;

    // Check health
    await this.checkHealthAndExecuteLiquidation(
      escrow,
      positionData,
      totalDebt,
      collateralPriceData.price,
      debtPriceData.price
    );
  }

  /**
   * Get the current cached prices
   */
  getCachedPrices(): { [symbol: string]: number } {
    const prices: { [symbol: string]: number } = {};
    for (const [symbol, data] of Object.entries(this.priceCache)) {
      // Convert BigInt back to USD float for API response
      prices[symbol] = Number(data.price) / Number(PRICE_BASE);
    }
    return prices;
  }

  /**
   * Run a single synchronization cycle
   */
  private async runSyncCycle(): Promise<void> {
    try {
      const escrows = this.storage.getAllEscrows();

      if (escrows.length === 0) {
        this.logger.debug('No escrows registered, skipping sync cycle');
        return;
      }

      if (!this.aztecClient.isInitialized()) {
        this.logger.warn('Aztec client not initialized, skipping sync cycle');
        return;
      }

      this.logger.info(
        { escrowCount: escrows.length },
        'Running sentinel sync cycle'
      );

      for (const escrow of escrows) {
        await this.syncEscrow(escrow);
      }

      this.logger.info('Sentinel sync cycle completed');
    } catch (error) {
      this.logger.error({ error }, 'Error in sentinel sync cycle');
    }
  }

  /**
   * Sync a single escrow account
   */
  private async syncEscrow(escrow: EscrowAccount): Promise<void> {
    try {
      this.logger.debug({ escrowAddress: escrow.address }, 'Syncing escrow');

      // Ensure escrow is registered with the Aztec client
      if (!this.aztecClient.getRegisteredEscrow(escrow.address)) {
        await this.aztecClient.registerEscrow(
          escrow.address,
          escrow.type,
          escrow.instance,
          escrow.secretKey
        );
      }

      // Sync private state on the escrow contract
      await this.aztecClient.syncEscrowPrivateState(escrow.address);

      // Fetch real position data from the pool
      const positionData = await this.aztecClient.getPositionData(
        escrow.address,
        escrow.poolAddress,
        escrow.type
      );

      // Calculate total debt with interest
      const currentEpoch = BigInt(Math.floor(Date.now() / 1000 / EPOCH_LENGTH));
      const interest = math.calculateInterest(
        positionData.debtAmount,
        positionData.debtEpoch,
        currentEpoch,
        BigInt(EPOCH_LENGTH),
        BORROW_INTEREST
      );
      const totalDebt = positionData.debtAmount + interest;

      // Build and store the position
      const position = this.buildPosition(escrow, positionData, totalDebt);
      this.storage.updatePosition(position);

      this.logger.debug(
        {
          escrowAddress: escrow.address,
          collateral: positionData.collateralAmount.toString(),
          debt: totalDebt.toString(),
        },
        'Position synced'
      );

      // Check health factor using cached prices
      const collateralSymbol = this.aztecClient.getTokenSymbol(escrow.collateralToken);
      const debtSymbol = this.aztecClient.getTokenSymbol(escrow.debtToken);

      if (collateralSymbol && debtSymbol) {
        const collateralPriceData = this.priceCache[collateralSymbol];
        const debtPriceData = this.priceCache[debtSymbol];

        if (collateralPriceData && debtPriceData) {
          await this.checkHealthAndExecuteLiquidation(
            escrow,
            positionData,
            totalDebt,
            collateralPriceData.price,
            debtPriceData.price
          );
        } else {
          this.logger.debug({ escrow: escrow.address, collateralSymbol, debtSymbol }, 'Skipping health check - prices not cached');
        }
      } else {
        this.logger.debug({ escrow: escrow.address }, 'Skipping health check - unknown token addresses');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        {
          escrowAddress: escrow.address,
          poolAddress: escrow.poolAddress,
          type: escrow.type,
          errorMessage,
          errorStack,
          errorType: error?.constructor?.name,
        },
        'Error syncing escrow'
      );
    }
  }

  /**
   * Check health factor and execute liquidation directly if needed
   * @param collateralPrice - price as BigInt scaled by PRICE_BASE
   * @param debtPrice - price as BigInt scaled by PRICE_BASE
   */
  private async checkHealthAndExecuteLiquidation(
    escrow: EscrowAccount,
    positionData: PositionData,
    totalDebt: bigint,
    collateralPrice: bigint,
    debtPrice: bigint
  ): Promise<void> {
    // Skip if no debt
    if (totalDebt === 0n) {
      this.logger.debug({ escrow: escrow.address }, 'No debt, skipping health check');
      return;
    }

    // Determine liquidation threshold based on collateral type
    const liquidationThreshold = this.getLiquidationThreshold(escrow.collateralToken);

    // Calculate health factor (prices are already BigInt scaled by PRICE_BASE)
    const healthFactor = math.calculateLtvHealth(
      debtPrice,
      totalDebt,
      collateralPrice,
      positionData.collateralAmount,
      liquidationThreshold
    );

    const healthFactorDecimal = Number(healthFactor) / Number(HEALTH_FACTOR_THRESHOLD);
    const isLiquidatable = healthFactor < HEALTH_FACTOR_THRESHOLD;

    // Convert prices to USD for logging
    const collateralPriceUSD = Number(collateralPrice) / Number(PRICE_BASE);
    const debtPriceUSD = Number(debtPrice) / Number(PRICE_BASE);

    this.logger.info(
      {
        escrow: escrow.address,
        healthFactor: healthFactor.toString(),
        healthFactorDecimal: healthFactorDecimal.toFixed(4),
        threshold: HEALTH_FACTOR_THRESHOLD.toString(),
        isLiquidatable,
        collateralPriceUSD,
        debtPriceUSD,
        collateralAmount: positionData.collateralAmount.toString(),
        debtAmount: totalDebt.toString(),
        liquidationThreshold: liquidationThreshold.toString(),
      },
      `Health check: ${healthFactorDecimal.toFixed(4)} ${isLiquidatable ? '< 1.0 - LIQUIDATABLE!' : '>= 1.0 - safe'}`
    );

    // Check if position is liquidatable (health factor < 1.0)
    if (isLiquidatable) {
      this.logger.warn(
        {
          escrow: escrow.address,
          healthFactor: healthFactor.toString(),
          threshold: HEALTH_FACTOR_THRESHOLD.toString(),
        },
        'Position is liquidatable!'
      );

      // Execute liquidation directly (pass BigInt prices)
      const result = await this.liquidationExecutor.executeLiquidation({
        escrow,
        positionData,
        totalDebt,
        healthFactor,
        collateralPrice,
        debtPrice,
      });

      if (result.success) {
        this.logger.info(
          { escrow: escrow.address, txHash: result.txHash, duration: result.duration },
          'Liquidation executed successfully'
        );
      } else {
        this.logger.error(
          { escrow: escrow.address, error: result.error, duration: result.duration },
          'Liquidation execution failed'
        );
      }
    }
  }

  /**
   * Get the liquidation threshold for a given collateral token address
   */
  private getLiquidationThreshold(collateralTokenAddress: string): bigint {
    const symbol = this.aztecClient.getTokenSymbol(collateralTokenAddress);
    if (symbol === 'ZEC') {
      return ZCASH_LIQUIDATION_THRESHOLD;
    }
    return USDC_LIQUIDATION_THRESHOLD;
  }

  /**
   * Build a CollateralPosition from escrow and position data
   */
  private buildPosition(
    escrow: EscrowAccount,
    positionData: PositionData,
    totalDebt: bigint
  ): CollateralPosition {
    const WAD = 10n ** 18n;
    const collateralAmount = Number(positionData.collateralAmount) / Number(WAD);
    const debtAmount = Number(totalDebt) / Number(WAD);

    const collateralSymbol = this.aztecClient.getTokenSymbol(escrow.collateralToken) ?? escrow.collateralToken;
    const debtSymbol = this.aztecClient.getTokenSymbol(escrow.debtToken) ?? escrow.debtToken;

    return {
      escrowAddress: escrow.address,
      collateralAsset: collateralSymbol,
      collateralAmount,
      debtAsset: debtSymbol,
      debtAmount,
      poolId: escrow.poolAddress,
      lastUpdated: Date.now(),
    };
  }

  /**
   * Force sync a specific escrow (on-demand)
   */
  async forceSyncEscrow(escrowAddress: string): Promise<void> {
    this.logger.info({ escrowAddress }, 'Force syncing escrow');

    const escrow = this.storage.getEscrow(escrowAddress);
    if (!escrow) {
      this.logger.warn({ escrowAddress }, 'Escrow not found in storage');
      return;
    }

    await this.syncEscrow(escrow);
  }

  /**
   * Force sync all escrows (on-demand full scan)
   */
  async forceSyncAll(): Promise<{ synced: number; errors: number }> {
    this.logger.info('Force syncing all escrows');
    await this.runSyncCycle();
    const escrows = this.storage.getAllEscrows();
    return { synced: escrows.length, errors: 0 };
  }

  /**
   * Get sync service status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      syncInterval: this.config.syncInterval,
      aztecClientInitialized: this.aztecClient.isInitialized(),
      cachedPrices: this.getCachedPrices(),
    };
  }
}
