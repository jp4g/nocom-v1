import { pino } from 'pino';
import { serve } from '@hono/node-server';
import {
  DEFAULT_PRICE_UPDATE_INTERVAL,
  DEFAULT_PRICE_CHANGE_THRESHOLD,
  DEFAULT_MAX_UPDATE_INTERVAL,
  DEFAULT_MAX_TRACKED_ASSETS,
  DEFAULT_PRICE_SERVICE_PORT,
} from '@liquidator/shared';
import { AssetStorage } from './storage';
import { CoinGeckoClient } from './coingecko-client';
import { AztecClient } from './aztec-client';
import { PriceMonitor } from './price-monitor';
import { createPriceServiceAPI } from './api';

// Load environment variables
const config = {
  coingeckoApiKey: process.env.COINGECKO_API_KEY || '',
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
  nodeUrl: process.env.AZTEC_NODE_URL || 'http://localhost:8080',
  liquidationEngineUrl:
    process.env.LIQUIDATION_ENGINE_URL || 'http://localhost:3002',
  liquidationApiKey:
    process.env.LIQUIDATION_API_KEY || 'default_api_key_change_me',
  noteMonitorUrl: process.env.NOTE_MONITOR_URL || 'http://note-monitor:3001',
  noteMonitorApiKey: process.env.NOTE_MONITOR_API_KEY || '',
  publicApiPort: parseInt(
    process.env.PUBLIC_API_PORT || String(DEFAULT_PRICE_SERVICE_PORT)
  ),
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
  // Initialize components
  logger.info('Initializing Price Service...');

  const storage = new AssetStorage(config.maxTrackedAssets);

  // Add default assets
  const defaultAssets = [
    { symbol: 'USDC', name: 'USD Coin' },
    { symbol: 'ZEC', name: 'Zcash' },
  ];
  for (const asset of defaultAssets) {
    storage.addAsset(asset);
    logger.info({ asset: asset.symbol }, 'Added default asset to tracking');
  }

  const coingeckoClient = new CoinGeckoClient(config.coingeckoApiKey, logger);

  // Initialize Aztec client
  const aztecClient = new AztecClient({ nodeUrl: config.nodeUrl }, logger);

  try {
    await aztecClient.initialize();
  } catch (error) {
    logger.error({ error }, 'Failed to initialize Aztec client - on-chain updates will be disabled');
    // Continue without Aztec - prices will still be fetched and cached
  }

  const priceMonitor = new PriceMonitor(
    storage,
    coingeckoClient,
    aztecClient,
    {
      priceChangeThreshold: config.priceChangeThreshold,
      maxUpdateInterval: config.maxUpdateInterval,
      updateInterval: config.priceUpdateInterval,
      liquidationEngineUrl: config.liquidationEngineUrl,
      liquidationApiKey: config.liquidationApiKey,
      noteMonitorUrl: config.noteMonitorUrl,
      noteMonitorApiKey: config.noteMonitorApiKey,
    },
    logger
  );

  // Create API server (with priceMonitor for config/price endpoints)
  const app = createPriceServiceAPI(storage, priceMonitor, logger);

  // Start services
  logger.info({ config }, 'Starting Price Service');

  // Start the price monitor
  priceMonitor.start();

  // Start the API server
  serve({
    fetch: app.fetch,
    port: config.publicApiPort,
  });

  logger.info({ port: config.publicApiPort }, 'Price Service API server started');

  // Graceful shutdown
  process.on('SIGINT', () => {
    logger.info('Shutting down Price Service...');
    priceMonitor.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.info('Shutting down Price Service...');
    priceMonitor.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal error starting Price Service:', error);
  process.exit(1);
});
