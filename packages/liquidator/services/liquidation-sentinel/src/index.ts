import { pino } from 'pino';
import { serve } from '@hono/node-server';
import { DEFAULT_SYNC_INTERVAL } from '@liquidator/shared';
import { SentinelStorage } from './storage';
import { AztecClient } from './aztec-client';
import { LiquidationExecutor } from './liquidation-executor';
import { SentinelSyncService } from './sentinel-sync';
import { createSentinelAPI } from './api';

// Default port for the sentinel service
const DEFAULT_SENTINEL_PORT = 9001;

// Load environment variables
const config = {
  nodeUrl: process.env.AZTEC_NODE_URL || 'http://localhost:8080',
  syncInterval: parseInt(
    process.env.SYNC_INTERVAL || String(DEFAULT_SYNC_INTERVAL)
  ),
  apiPort: parseInt(
    process.env.SENTINEL_API_PORT || String(DEFAULT_SENTINEL_PORT)
  ),
  logLevel: (process.env.LOG_LEVEL || 'info') as pino.Level,
  priceServiceUrl: process.env.PRICE_SERVICE_URL || 'http://localhost:9000',
  priceServiceApiKey: process.env.PRICE_SERVICE_API_KEY || '',
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
  logger.info('Initializing Liquidation Sentinel...');

  // Initialize storage
  const storage = new SentinelStorage();

  // Initialize Aztec client
  const aztecClient = new AztecClient({ nodeUrl: config.nodeUrl }, logger);

  try {
    await aztecClient.initialize();
  } catch (error) {
    logger.error({ error }, 'Failed to initialize Aztec client - monitoring will be limited');
    // Continue without Aztec - the service can still accept registrations
    // but won't be able to sync real data until the node is available
  }

  // Initialize liquidation executor
  const liquidationExecutor = new LiquidationExecutor(aztecClient, logger);

  // Initialize sync service with direct liquidation execution
  const syncService = new SentinelSyncService(
    storage,
    aztecClient,
    liquidationExecutor,
    {
      syncInterval: config.syncInterval,
      priceServiceUrl: config.priceServiceUrl,
    },
    logger
  );

  // Create API server
  const app = createSentinelAPI(storage, syncService, logger, {
    priceServiceApiKey: config.priceServiceApiKey,
  });

  // Start services
  logger.info({ config }, 'Starting Liquidation Sentinel');

  // Start the sync service (fetches initial prices, then begins sync loop)
  await syncService.start();

  // Start the API server
  serve({
    fetch: app.fetch,
    port: config.apiPort,
  });

  logger.info(
    { port: config.apiPort },
    'Liquidation Sentinel API server started'
  );

  // Graceful shutdown
  process.on('SIGINT', () => {
    logger.info('Shutting down Liquidation Sentinel...');
    syncService.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.info('Shutting down Liquidation Sentinel...');
    syncService.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal error starting Liquidation Sentinel:', error);
  process.exit(1);
});
