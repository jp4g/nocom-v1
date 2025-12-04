import type { NoteMonitorStorage } from './storage';
import type { AztecClient, PositionData } from './aztec-client';
import type { CollateralPosition, EscrowAccount, Price, LiquidationTriggerRequest } from '@liquidator/shared';
import type { Logger } from 'pino';
import { math } from '@nocom-v1/contracts/utils';
import {
  HEALTH_FACTOR_THRESHOLD,
  ZCASH_LIQUIDATION_THRESHOLD,
  USDC_LIQUIDATION_THRESHOLD,
  EPOCH_LENGTH,
  BORROW_INTEREST,
} from '@nocom-v1/contracts/constants';

export interface NoteSyncConfig {
  syncInterval: number; // milliseconds
  priceServiceUrl?: string; // URL to fetch initial prices from
  liquidationEngineUrl?: string; // URL to trigger liquidations
  liquidationApiKey?: string; // API key for liquidation engine
}

interface PriceCache {
  [symbol: string]: {
    price: number; // USD price
    updatedAt: number; // timestamp
  };
}

/**
 * Note Synchronization Service
 * Handles periodic syncing of escrow positions using the Aztec node
 * Maintains a price cache updated via push from price-service
 * Calculates health factors and triggers liquidations when needed
 */
export class NoteSyncService {
  private storage: NoteMonitorStorage;
  private aztecClient: AztecClient;
  private config: NoteSyncConfig;
  private logger: Logger;
  private intervalId?: Timer;
  private isRunning: boolean = false;

  // Price cache - updated via push from price-service
  private priceCache: PriceCache = {};

  constructor(
    storage: NoteMonitorStorage,
    aztecClient: AztecClient,
    config: NoteSyncConfig,
    logger: Logger
  ) {
    this.storage = storage;
    this.aztecClient = aztecClient;
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
   * Start the note synchronization loop
   * Fetches initial prices and begins periodic position syncing
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Note sync service is already running');
      return;
    }

    this.logger.info(
      { interval: this.config.syncInterval },
      'Starting note sync service'
    );

    // Fetch initial prices from price-service
    await this.fetchInitialPrices();

    this.isRunning = true;

    // Run immediately then on interval
    this.runSyncCycle();

    this.intervalId = setInterval(() => {
      this.runSyncCycle();
    }, this.config.syncInterval);
  }

  /**
   * Stop the note synchronization loop
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    this.isRunning = false;
    this.logger.info('Note sync service stopped');
  }

  /**
   * Fetch initial prices from price-service on startup
   */
  private async fetchInitialPrices(): Promise<void> {
    if (!this.config.priceServiceUrl) {
      this.logger.warn('No price service URL configured, prices must be pushed');
      return;
    }

    try {
      this.logger.info({ url: this.config.priceServiceUrl }, 'Fetching initial prices from price-service');

      const response = await fetch(`${this.config.priceServiceUrl}/prices`);
      if (!response.ok) {
        this.logger.error({ status: response.status }, 'Failed to fetch initial prices');
        return;
      }

      const data = await response.json();
      const now = Date.now();

      for (const price of data.prices as Price[]) {
        const symbol = price.asset.toUpperCase();
        this.priceCache[symbol] = {
          price: price.price,
          updatedAt: now,
        };
      }

      this.logger.info(
        { prices: Object.keys(this.priceCache).map(s => `${s}: $${this.priceCache[s]!.price}`) },
        'Initial prices loaded'
      );
    } catch (error) {
      this.logger.error({ error }, 'Error fetching initial prices');
    }
  }

  /**
   * Handle a price update pushed from price-service
   * Updates the cache and immediately checks health for affected escrows
   */
  async handlePriceUpdate(asset: string, newPrice: number): Promise<void> {
    const symbol = asset.toUpperCase();
    const previousPrice = this.priceCache[symbol]?.price;

    // Update cache
    this.priceCache[symbol] = {
      price: newPrice,
      updatedAt: Date.now(),
    };

    this.logger.info(
      { asset: symbol, previousPrice, newPrice },
      'Price update received'
    );

    // Check health for escrows affected by this price change
    await this.checkHealthForAffectedEscrows(symbol);
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
    const affectedEscrows = escrows.filter(
      e => e.collateralToken.toUpperCase() === changedAsset ||
           e.debtToken.toUpperCase() === changedAsset
    );

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
    // Get cached prices
    const collateralPriceData = this.priceCache[escrow.collateralToken.toUpperCase()];
    const debtPriceData = this.priceCache[escrow.debtToken.toUpperCase()];

    if (!collateralPriceData || !debtPriceData) {
      this.logger.warn(
        { escrow: escrow.address, collateralToken: escrow.collateralToken, debtToken: escrow.debtToken },
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
    await this.checkHealthAndTriggerLiquidation(
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
      prices[symbol] = data.price;
    }
    return prices;
  }

  /**
   * Run a single synchronization cycle
   * Syncs position data from chain (prices come from cache)
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
        'Running note sync cycle'
      );

      // Sync each escrow using cached prices
      for (const escrow of escrows) {
        await this.syncEscrow(escrow);
      }

      this.logger.info('Note sync cycle completed');
    } catch (error) {
      this.logger.error({ error }, 'Error in note sync cycle');
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
      const collateralPriceData = this.priceCache[escrow.collateralToken.toUpperCase()];
      const debtPriceData = this.priceCache[escrow.debtToken.toUpperCase()];

      if (collateralPriceData && debtPriceData) {
        await this.checkHealthAndTriggerLiquidation(
          escrow,
          positionData,
          totalDebt,
          collateralPriceData.price,
          debtPriceData.price
        );
      } else {
        this.logger.debug({ escrow: escrow.address }, 'Skipping health check - prices not cached');
      }
    } catch (error) {
      this.logger.error({ error, escrowAddress: escrow.address }, 'Error syncing escrow');
    }
  }

  /**
   * Check health factor and trigger liquidation if needed
   */
  private async checkHealthAndTriggerLiquidation(
    escrow: EscrowAccount,
    positionData: PositionData,
    totalDebt: bigint,
    collateralPrice: number,
    debtPrice: number
  ): Promise<void> {
    // Skip if no debt
    if (totalDebt === 0n) {
      this.logger.debug({ escrow: escrow.address }, 'No debt, skipping health check');
      return;
    }

    // Determine liquidation threshold based on collateral type
    const liquidationThreshold = this.getLiquidationThreshold(escrow.collateralToken);

    // Convert prices to bigint with PRICE_BASE (10000 = $1.00)
    const collateralPriceBigint = BigInt(Math.round(collateralPrice * 10000));
    const debtPriceBigint = BigInt(Math.round(debtPrice * 10000));

    // Calculate health factor using the contract's utility function
    const healthFactor = math.calculateLtvHealth(
      debtPriceBigint,
      totalDebt,
      collateralPriceBigint,
      positionData.collateralAmount,
      liquidationThreshold
    );

    this.logger.debug(
      {
        escrow: escrow.address,
        healthFactor: healthFactor.toString(),
        threshold: HEALTH_FACTOR_THRESHOLD.toString(),
        collateralPrice,
        debtPrice,
        collateralAmount: positionData.collateralAmount.toString(),
        debtAmount: totalDebt.toString(),
      },
      'Health factor calculated'
    );

    // Check if position is liquidatable (health factor < 1.0)
    // HEALTH_FACTOR_THRESHOLD = 100000 (represents 1.0 with 5 decimal places)
    if (healthFactor < HEALTH_FACTOR_THRESHOLD) {
      this.logger.warn(
        {
          escrow: escrow.address,
          healthFactor: healthFactor.toString(),
          threshold: HEALTH_FACTOR_THRESHOLD.toString(),
        },
        'Position is liquidatable!'
      );

      // Trigger liquidation
      await this.triggerLiquidation(escrow, positionData, totalDebt, healthFactor, collateralPrice, debtPrice);
    }
  }

  /**
   * Get the liquidation threshold for a given collateral token
   */
  private getLiquidationThreshold(collateralToken: string): bigint {
    const token = collateralToken.toUpperCase();
    if (token === 'ZEC' || token === 'ZCASH') {
      return ZCASH_LIQUIDATION_THRESHOLD;
    }
    // Default to USDC threshold for USDC and other tokens
    return USDC_LIQUIDATION_THRESHOLD;
  }

  /**
   * Trigger liquidation by posting to the liquidation engine
   */
  private async triggerLiquidation(
    escrow: EscrowAccount,
    positionData: PositionData,
    totalDebt: bigint,
    healthFactor: bigint,
    collateralPrice: number,
    debtPrice: number
  ): Promise<void> {
    if (!this.config.liquidationEngineUrl) {
      this.logger.error('No liquidation engine URL configured, cannot trigger liquidation');
      return;
    }

    const payload: LiquidationTriggerRequest = {
      escrow,
      positionData: {
        collateralAmount: positionData.collateralAmount.toString(),
        debtAmount: positionData.debtAmount.toString(),
        debtEpoch: positionData.debtEpoch.toString(),
        totalDebt: totalDebt.toString(),
      },
      healthFactor: healthFactor.toString(),
      collateralPrice,
      debtPrice,
    };

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.config.liquidationApiKey) {
        headers['X-API-Key'] = this.config.liquidationApiKey;
      }

      const response = await fetch(`${this.config.liquidationEngineUrl}/trigger-liquidation`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          { status: response.status, error: errorText, escrow: escrow.address },
          'Failed to trigger liquidation'
        );
        return;
      }

      const result = await response.json();
      this.logger.info(
        { escrow: escrow.address, result },
        'Liquidation triggered successfully'
      );
    } catch (error) {
      this.logger.error({ error, escrow: escrow.address }, 'Error triggering liquidation');
    }
  }

  /**
   * Build a CollateralPosition from escrow and position data
   */
  private buildPosition(
    escrow: EscrowAccount,
    positionData: PositionData,
    totalDebt: bigint
  ): CollateralPosition {
    // Convert bigint amounts to number (with proper scaling)
    // Assuming 18 decimals for token amounts
    const WAD = 10n ** 18n;
    const collateralAmount = Number(positionData.collateralAmount) / Number(WAD);
    const debtAmount = Number(totalDebt) / Number(WAD);

    return {
      escrowAddress: escrow.address,
      collateralAsset: escrow.collateralToken,
      collateralAmount,
      debtAsset: escrow.debtToken,
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
   * Get sync service status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      syncInterval: this.config.syncInterval,
      aztecClientInitialized: this.aztecClient.isInitialized(),
      priceServiceConfigured: !!this.config.priceServiceUrl,
      liquidationEngineConfigured: !!this.config.liquidationEngineUrl,
      cachedPrices: this.getCachedPrices(),
    };
  }
}
