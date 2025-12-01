import type { Price } from '@liquidator/shared';
import { calculatePercentageChange } from '@liquidator/shared';
import type { AssetStorage } from './storage';
import type { CoinMarketCapClient } from './cmc-client';
import type { MockPriceOracle } from './oracle-mock';
import type { Logger } from 'pino';

export interface PriceMonitorConfig {
  priceChangeThreshold: number; // percentage
  maxUpdateInterval: number; // milliseconds
  updateInterval: number; // milliseconds (60 seconds)
  liquidationEngineUrl: string;
  liquidationApiKey: string;
}

/**
 * Price Monitor - handles price fetching, comparison, and updates
 */
export class PriceMonitor {
  private storage: AssetStorage;
  private cmcClient: CoinMarketCapClient;
  private oracle: MockPriceOracle;
  private config: PriceMonitorConfig;
  private logger: Logger;
  private intervalId?: Timer;
  private isRunning: boolean = false;

  constructor(
    storage: AssetStorage,
    cmcClient: CoinMarketCapClient,
    oracle: MockPriceOracle,
    config: PriceMonitorConfig,
    logger: Logger
  ) {
    this.storage = storage;
    this.cmcClient = cmcClient;
    this.oracle = oracle;
    this.config = config;
    this.logger = logger;
  }

  /**
   * Start the price monitoring loop
   */
  start(): void {
    if (this.isRunning) {
      this.logger.warn('Price monitor is already running');
      return;
    }

    this.logger.info(
      {
        interval: this.config.updateInterval,
        threshold: this.config.priceChangeThreshold,
      },
      'Starting price monitor'
    );

    this.isRunning = true;

    // Run immediately then on interval
    this.runPriceCheck();

    this.intervalId = setInterval(() => {
      this.runPriceCheck();
    }, this.config.updateInterval);
  }

  /**
   * Stop the price monitoring loop
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    this.isRunning = false;
    this.logger.info('Price monitor stopped');
  }

  /**
   * Run a single price check cycle
   */
  private async runPriceCheck(): Promise<void> {
    try {
      const symbols = this.storage.getTrackedSymbols();

      if (symbols.length === 0) {
        this.logger.debug('No assets being tracked, skipping price check');
        return;
      }

      this.logger.info({ assetCount: symbols.length }, 'Running price check');

      // Fetch current prices from CMC
      const prices = await this.cmcClient.fetchPrices(symbols);

      // Update storage with new prices
      for (const price of prices) {
        this.storage.updatePrice(price);
      }

      // Check each asset for update conditions
      for (const price of prices) {
        await this.checkAndUpdatePrice(price);
      }
    } catch (error) {
      this.logger.error({ error }, 'Error in price check cycle');
    }
  }

  /**
   * Check if a price needs to be updated on-chain
   */
  private async checkAndUpdatePrice(currentPrice: Price): Promise<void> {
    const { asset, price } = currentPrice;

    // Get previous on-chain price
    let previousPrice = await this.oracle.getOnChainPrice(asset);

    // If no previous price, initialize with current price
    if (previousPrice === undefined) {
      this.logger.info({ asset, price }, 'No previous on-chain price, initializing');
      this.oracle.initializePrice(asset, price);
      this.storage.setLastUpdateTime(asset, Date.now());
      return;
    }

    // Calculate percentage change
    const percentChange = calculatePercentageChange(previousPrice, price);
    const absChange = Math.abs(percentChange);

    // Check time since last update
    const timeSinceUpdate = this.storage.getTimeSinceLastUpdate(asset);
    const timeThresholdExceeded =
      timeSinceUpdate !== undefined &&
      timeSinceUpdate >= this.config.maxUpdateInterval;

    // Determine if update is needed
    const priceChangeExceeded = absChange >= this.config.priceChangeThreshold;

    if (priceChangeExceeded || timeThresholdExceeded) {
      const reason = priceChangeExceeded
        ? `price change ${percentChange.toFixed(2)}%`
        : `time threshold (${(timeSinceUpdate! / 1000).toFixed(0)}s)`;

      this.logger.info(
        { asset, previousPrice, newPrice: price, percentChange, reason },
        'Updating on-chain price'
      );

      // Update on-chain
      const result = await this.oracle.updateOnChainPrice(asset, price);

      if (result.success) {
        this.storage.setLastUpdateTime(asset, Date.now());
        this.storage.setPreviousOnChainPrice(asset, price);

        this.logger.info(
          { asset, price, txHash: result.txHash },
          'On-chain price update successful'
        );

        // Notify liquidation engine
        await this.notifyLiquidationEngine(asset, price);
      } else {
        this.logger.error({ asset, price }, 'On-chain price update failed');
      }
    } else {
      this.logger.debug(
        { asset, percentChange, timeSinceUpdate },
        'Price update not needed'
      );
    }
  }

  /**
   * Notify the liquidation engine of a price update
   */
  private async notifyLiquidationEngine(
    asset: string,
    newPrice: number
  ): Promise<void> {
    try {
      this.logger.info({ asset, newPrice }, 'Notifying liquidation engine');

      const response = await fetch(
        `${this.config.liquidationEngineUrl}/price-update`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.config.liquidationApiKey,
          },
          body: JSON.stringify({
            asset,
            newPrice,
            timestamp: Date.now(),
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      this.logger.info({ asset }, 'Liquidation engine notified successfully');
    } catch (error) {
      this.logger.error(
        { error, asset },
        'Failed to notify liquidation engine'
      );
      // Don't throw - this shouldn't stop the price monitoring
    }
  }
}
