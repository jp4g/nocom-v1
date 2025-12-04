import type { Price } from '@liquidator/shared';
import { calculatePercentageChange } from '@liquidator/shared';
import type { AssetStorage } from './storage';
import type { CoinGeckoClient } from './coingecko-client';
import type { AztecClient } from './aztec-client';
import { OracleClient, type PriceUpdate } from './oracle-client';
import type { Logger } from 'pino';

export interface PriceMonitorConfig {
  priceChangeThreshold: number; // percentage
  maxUpdateInterval: number; // milliseconds
  updateInterval: number; // milliseconds (60 seconds)
  liquidationEngineUrl: string;
  liquidationApiKey: string;
  noteMonitorUrl?: string; // URL to push price updates to note-monitor
  noteMonitorApiKey?: string; // API key for note-monitor
}

/**
 * Price Monitor - handles price fetching, comparison, and updates
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

          // Notify note-monitor and liquidation engine for each updated asset
          for (const update of updatesNeeded) {
            const usdPrice = OracleClient.priceFromOnChain(update.price);
            // Notify note-monitor first (it will check health and trigger liquidations if needed)
            await this.notifyNoteMonitor(update.asset, usdPrice);
            // Also notify liquidation engine directly for any positions it's tracking
            await this.notifyLiquidationEngine(update.asset, usdPrice);
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
   * Notify the note-monitor of a price update (pushes to its cache)
   */
  private async notifyNoteMonitor(asset: string, newPrice: number): Promise<void> {
    if (!this.config.noteMonitorUrl) {
      this.logger.debug('No note-monitor URL configured, skipping notification');
      return;
    }

    try {
      this.logger.info({ asset, newPrice }, 'Notifying note-monitor');

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.config.noteMonitorApiKey) {
        headers['X-API-Key'] = this.config.noteMonitorApiKey;
      }

      const response = await fetch(`${this.config.noteMonitorUrl}/price-update`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          asset,
          newPrice,
          timestamp: Date.now(),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      this.logger.info({ asset }, 'Note-monitor notified successfully');
    } catch (error) {
      this.logger.error({ error, asset }, 'Failed to notify note-monitor');
      // Don't throw - this shouldn't stop the price monitoring
    }
  }

  /**
   * Notify the liquidation engine of a price update
   */
  private async notifyLiquidationEngine(asset: string, newPrice: number): Promise<void> {
    try {
      this.logger.info({ asset, newPrice }, 'Notifying liquidation engine');

      const response = await fetch(`${this.config.liquidationEngineUrl}/price-update`, {
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
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      this.logger.info({ asset }, 'Liquidation engine notified successfully');
    } catch (error) {
      this.logger.error({ error, asset }, 'Failed to notify liquidation engine');
      // Don't throw - this shouldn't stop the price monitoring
    }
  }
}
