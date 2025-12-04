import type { Price } from './utils';
import { calculatePercentageChange } from './utils';
import type { AssetStorage } from './storage';
import type { CoinGeckoClient } from './coingecko-client';
import type { AztecClient } from './aztec-client';
import { OracleClient, type PriceUpdate } from './oracle-client';
import type { Logger } from 'pino';

export interface PriceMonitorConfig {
  priceChangeThreshold: number; // percentage
  maxUpdateInterval: number; // milliseconds
  updateInterval: number; // milliseconds (60 seconds)
}

// Callback type for price updates - allows direct integration with sync service
export type PriceUpdateCallback = (asset: string, newPrice: number) => Promise<void>;

/**
 * Price Monitor - handles price fetching, comparison, and updates
 * Directly notifies the sync service when prices change (no HTTP overhead)
 */
export class PriceMonitor {
  private storage: AssetStorage;
  private priceClient: CoinGeckoClient;
  private aztecClient: AztecClient;
  private oracleClient: OracleClient;
  private config: PriceMonitorConfig;
  private logger: Logger;
  private intervalId?: Timer;
  private isRunning: boolean = false;

  // Direct callback for price updates (replaces HTTP calls)
  private onPriceUpdate?: PriceUpdateCallback;

  constructor(
    storage: AssetStorage,
    priceClient: CoinGeckoClient,
    aztecClient: AztecClient,
    config: PriceMonitorConfig,
    logger: Logger
  ) {
    this.storage = storage;
    this.priceClient = priceClient;
    this.aztecClient = aztecClient;
    this.oracleClient = new OracleClient(aztecClient, logger);
    this.config = config;
    this.logger = logger;
  }

  /**
   * Set the callback for price updates
   * This replaces the HTTP notification to the sentinel service
   */
  setPriceUpdateCallback(callback: PriceUpdateCallback): void {
    this.onPriceUpdate = callback;
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
   * Update the polling interval (in seconds)
   */
  setUpdateInterval(seconds: number): void {
    const newInterval = seconds * 1000;
    this.config.updateInterval = newInterval;

    this.logger.info(
      { seconds, intervalMs: newInterval },
      'Update interval changed'
    );

    // Restart the interval if running
    if (this.isRunning && this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = setInterval(() => {
        this.runPriceCheck();
      }, newInterval);
    }
  }

  /**
   * Get the current update interval in seconds
   */
  getUpdateInterval(): number {
    return this.config.updateInterval / 1000;
  }

  /**
   * Manually set the price for an asset and update on-chain
   * @param asset The asset symbol (e.g., 'ZEC')
   * @param price The price in USD (e.g., 1.23 for $1.23)
   */
  async setPrice(asset: string, price: number): Promise<{ success: boolean; txHash?: string; error?: string }> {
    const symbol = asset.toUpperCase();

    this.logger.info({ asset: symbol, price }, 'Manually setting price');

    // Get token address from deployments
    const assetAddress = this.aztecClient.getTokenAddress(symbol);
    if (!assetAddress) {
      return { success: false, error: `No token address found for asset: ${symbol}` };
    }

    // Update local storage
    this.storage.updatePrice({ asset: symbol, price, timestamp: Date.now() });

    // Update on-chain
    const onChainPrice = OracleClient.priceToOnChain(price);
    const result = await this.oracleClient.updatePrices([
      { asset: symbol, assetAddress, price: onChainPrice },
    ]);

    if (result.success) {
      // Update local state
      this.storage.setLastUpdateTime(symbol, Date.now());
      this.storage.setPreviousOnChainPrice(symbol, price);

      this.logger.info(
        { asset: symbol, price, txHash: result.txHash },
        'Price set successfully (on-chain updated)'
      );

      // Notify sync service directly (no HTTP)
      await this.notifyPriceUpdate(symbol, price);
    } else {
      this.logger.error(
        { asset: symbol, price, error: result.error },
        'Failed to set price on-chain'
      );
    }

    return result;
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

      // Fetch current prices from CoinGecko
      const prices = await this.priceClient.fetchPrices(symbols);

      // Update storage with new prices
      for (const price of prices) {
        this.storage.updatePrice(price);
      }

      // Collect all prices that need on-chain updates
      const updatesNeeded = await this.collectUpdatesNeeded(prices);

      if (updatesNeeded.length > 0) {
        // Batch update on-chain prices
        const result = await this.oracleClient.updatePrices(updatesNeeded);

        if (result.success) {
          // Update local state for all successful updates
          for (const update of updatesNeeded) {
            const usdPrice = OracleClient.priceFromOnChain(update.price);
            this.storage.setLastUpdateTime(update.asset, Date.now());
            this.storage.setPreviousOnChainPrice(update.asset, usdPrice);
          }

          this.logger.info(
            { txHash: result.txHash, assets: updatesNeeded.map((u) => u.asset) },
            'On-chain price update successful'
          );

          // Notify sync service directly for each updated asset
          for (const update of updatesNeeded) {
            const usdPrice = OracleClient.priceFromOnChain(update.price);
            await this.notifyPriceUpdate(update.asset, usdPrice);
          }
        } else {
          this.logger.error(
            { error: result.error, assets: updatesNeeded.map((u) => u.asset) },
            'On-chain price update failed'
          );
        }
      }
    } catch (error) {
      this.logger.error({ error }, 'Error in price check cycle');
    }
  }

  /**
   * Collect all prices that need on-chain updates
   */
  private async collectUpdatesNeeded(prices: Price[]): Promise<PriceUpdate[]> {
    const updates: PriceUpdate[] = [];

    for (const currentPrice of prices) {
      const { asset, price } = currentPrice;

      // Get token address from deployments
      const assetAddress = this.aztecClient.getTokenAddress(asset);
      if (!assetAddress) {
        this.logger.warn({ asset }, 'No token address found for asset, skipping');
        continue;
      }

      // Get previous on-chain price
      const previousOnChainPrice = await this.oracleClient.getOnChainPrice(assetAddress);
      const previousPrice =
        previousOnChainPrice !== undefined
          ? OracleClient.priceFromOnChain(previousOnChainPrice)
          : undefined;

      // If no previous price, we need to initialize
      if (previousPrice === undefined) {
        this.logger.info({ asset, price }, 'No previous on-chain price, will initialize');
        updates.push({
          asset,
          assetAddress,
          price: OracleClient.priceToOnChain(price),
        });
        continue;
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
          'Price update needed'
        );

        updates.push({
          asset,
          assetAddress,
          price: OracleClient.priceToOnChain(price),
        });
      } else {
        this.logger.debug(
          { asset, percentChange, timeSinceUpdate },
          'Price update not needed'
        );
      }
    }

    return updates;
  }

  /**
   * Notify the sync service of a price update (direct callback, no HTTP)
   */
  private async notifyPriceUpdate(asset: string, newPrice: number): Promise<void> {
    if (!this.onPriceUpdate) {
      this.logger.debug('No price update callback configured');
      return;
    }

    try {
      this.logger.debug({ asset, newPrice }, 'Notifying sync service of price update');
      await this.onPriceUpdate(asset, newPrice);
      this.logger.debug({ asset }, 'Sync service notified successfully');
    } catch (error) {
      this.logger.error({ error, asset }, 'Failed to notify sync service');
      // Don't throw - this shouldn't stop the price monitoring
    }
  }
}
