import { pino } from 'pino';
import { serve } from '@hono/node-server';
import {
  DEFAULT_PRICE_UPDATE_INTERVAL,
  DEFAULT_PRICE_CHANGE_THRESHOLD,
  DEFAULT_MAX_UPDATE_INTERVAL,
  DEFAULT_MAX_TRACKED_ASSETS,
  DEFAULT_SYNC_INTERVAL,
} from './utils';
import { AssetStorage, SentinelStorage } from './storage';
import { CoinGeckoClient } from './coingecko-client';
import { AztecClient } from './aztec-client';
import { PriceMonitor } from './price-monitor';
import { SentinelSyncService } from './sentinel-sync';
import { LiquidationExecutor } from './liquidation-executor';
import { createLiquidatorAPI } from './api';

// Default port for the unified service
const DEFAULT_LIQUIDATOR_PORT = 9000;

// Load environment variables
const config = {
  // CoinGecko
  coingeckoApiKey: process.env.COINGECKO_API_KEY || '',

  // Price monitoring config
  priceUpdateInterval: parseInt(
    process.env.PRICE_UPDATE_INTERVAL || String(DEFAULT_PRICE_UPDATE_INTERVAL)
  ),
  priceChangeThreshold: parseFloat(
    process.env.PRICE_CHANGE_THRESHOLD || String(DEFAULT_PRICE_CHANGE_THRESHOLD)
  ),
  maxUpdateInterval: parseInt(
    process.env.MAX_UPDATE_INTERVAL || String(DEFAULT_MAX_UPDATE_INTERVAL)
  ),
  maxTrackedAssets: parseInt(
    process.env.MAX_TRACKED_ASSETS || String(DEFAULT_MAX_TRACKED_ASSETS)
  ),

  // Aztec node
  nodeUrl: process.env.AZTEC_NODE_URL || 'http://localhost:8080',

  // Sentinel sync config
  syncInterval: parseInt(
    process.env.SYNC_INTERVAL || String(DEFAULT_SYNC_INTERVAL)
  ),

  // API config
  apiPort: parseInt(
    process.env.LIQUIDATOR_PORT || process.env.PORT || String(DEFAULT_LIQUIDATOR_PORT)
  ),

  // Logging
  logLevel: (process.env.LOG_LEVEL || 'info') as pino.Level,
};

// Initialize logger
const logger = pino({
  level: config.logLevel,
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  },
});

async function main() {
  logger.info('Initializing Unified Liquidator Service...');

  // Initialize storage
  const assetStorage = new AssetStorage(config.maxTrackedAssets);
  const sentinelStorage = new SentinelStorage();

  // Add default assets
  const defaultAssets = [
    { symbol: 'USDC', name: 'USD Coin' },
    { symbol: 'ZEC', name: 'Zcash' },
  ];
  for (const asset of defaultAssets) {
    assetStorage.addAsset(asset);
    logger.info({ asset: asset.symbol }, 'Added default asset to tracking');
  }

  // Initialize CoinGecko client
  const coingeckoClient = new CoinGeckoClient(config.coingeckoApiKey, logger);

  // Initialize Aztec client (single client for all operations)
  const aztecClient = new AztecClient({ nodeUrl: config.nodeUrl }, logger);

  try {
    await aztecClient.initialize();
  } catch (error) {
    logger.error({ error }, 'Failed to initialize Aztec client - service will run with limited functionality');
    // Continue without Aztec - the service can still accept registrations and cache prices
  }

  // Initialize liquidation executor
  const liquidationExecutor = new LiquidationExecutor(aztecClient, logger);

  // Initialize sync service
  const syncService = new SentinelSyncService(
    sentinelStorage,
    aztecClient,
    liquidationExecutor,
    {
      syncInterval: config.syncInterval,
    },
    logger
  );

  // Initialize price monitor
  const priceMonitor = new PriceMonitor(
    assetStorage,
    coingeckoClient,
    aztecClient,
    {
      priceChangeThreshold: config.priceChangeThreshold,
      maxUpdateInterval: config.maxUpdateInterval,
      updateInterval: config.priceUpdateInterval,
    },
    logger
  );

  // Wire up direct price update callback (no HTTP between services!)
  priceMonitor.setPriceUpdateCallback(async (asset, newPrice) => {
    await syncService.handlePriceUpdate(asset, newPrice);
  });

  // Create API server
  const app = createLiquidatorAPI(
    assetStorage,
    sentinelStorage,
    priceMonitor,
    syncService,
    logger
  );

  // Start services
  logger.info({ config }, 'Starting Unified Liquidator Service');

  // Start the price monitor (fetches prices, updates oracle)
  priceMonitor.start();

  // Start the sync service (syncs positions, executes liquidations)
  await syncService.start();

  // Start the API server
  serve({
    fetch: app.fetch,
    port: config.apiPort,
  });

  logger.info({ port: config.apiPort }, 'Liquidator API server started');

  // Graceful shutdown
  const shutdown = () => {
    logger.info('Shutting down Liquidator Service...');
    priceMonitor.stop();
    syncService.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('Fatal error starting Liquidator Service:', error);
  process.exit(1);
});
