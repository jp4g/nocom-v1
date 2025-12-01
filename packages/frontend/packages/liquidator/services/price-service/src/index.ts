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
import { CoinMarketCapClient } from './cmc-client';
import { MockPriceOracle } from './oracle-mock';
import { PriceMonitor } from './price-monitor';
import { createPriceServiceAPI } from './api';

// Load environment variables
const config = {
  cmcApiKey: process.env.CMC_API_KEY || 'mock_api_key',
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
  contractAddress:
    process.env.CONTRACT_ADDRESS ||
    '0x0000000000000000000000000000000000000000',
  liquidationEngineUrl:
    process.env.LIQUIDATION_ENGINE_URL || 'http://localhost:3002',
  liquidationApiKey:
    process.env.LIQUIDATION_API_KEY || 'default_api_key_change_me',
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

// Initialize components
logger.info('Initializing Price Service...');

const storage = new AssetStorage(config.maxTrackedAssets);
const cmcClient = new CoinMarketCapClient(config.cmcApiKey, logger);
const oracle = new MockPriceOracle(config.contractAddress, logger);

const priceMonitor = new PriceMonitor(
  storage,
  cmcClient,
  oracle,
  {
    priceChangeThreshold: config.priceChangeThreshold,
    maxUpdateInterval: config.maxUpdateInterval,
    updateInterval: config.priceUpdateInterval,
    liquidationEngineUrl: config.liquidationEngineUrl,
    liquidationApiKey: config.liquidationApiKey,
  },
  logger
);

// Create API server
const app = createPriceServiceAPI(storage, logger);

// Start services
logger.info({ config }, 'Starting Price Service');

// Start the price monitor
priceMonitor.start();

// Start the API server
serve({
  fetch: app.fetch,
  port: config.publicApiPort,
});

logger.info(
  { port: config.publicApiPort },
  'Price Service API server started'
);

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
