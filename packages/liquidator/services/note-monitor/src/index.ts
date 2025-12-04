import { pino } from 'pino';
import { serve } from '@hono/node-server';
import {
  DEFAULT_SYNC_INTERVAL,
  DEFAULT_NOTE_MONITOR_PORT,
} from '@liquidator/shared';
import { NoteMonitorStorage } from './storage';
import { AztecClient } from './aztec-client';
import { NoteSyncService } from './note-sync';
import { createNoteMonitorAPI } from './api';

// Load environment variables
const config = {
  nodeUrl: process.env.AZTEC_NODE_URL || 'http://localhost:8080',
  syncInterval: parseInt(
    process.env.SYNC_INTERVAL || String(DEFAULT_SYNC_INTERVAL)
  ),
  apiPort: parseInt(
    process.env.NOTE_MONITOR_API_PORT || String(DEFAULT_NOTE_MONITOR_PORT)
  ),
  logLevel: (process.env.LOG_LEVEL || 'info') as pino.Level,
  priceServiceUrl: process.env.PRICE_SERVICE_URL || 'http://localhost:3000',
  liquidationEngineUrl: process.env.LIQUIDATION_ENGINE_URL || 'http://localhost:3002',
  liquidationApiKey: process.env.LIQUIDATION_API_KEY || '',
  priceServiceApiKey: process.env.PRICE_SERVICE_API_KEY || '', // API key for price-service to push updates
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
  logger.info('Initializing Note Monitor Service...');

  const storage = new NoteMonitorStorage();

  // Initialize Aztec client
  const aztecClient = new AztecClient({ nodeUrl: config.nodeUrl }, logger);

  try {
    await aztecClient.initialize();
  } catch (error) {
    logger.error({ error }, 'Failed to initialize Aztec client - escrow monitoring will be limited');
    // Continue without Aztec - the service can still accept registrations
    // but won't be able to sync real data until the node is available
  }

  const syncService = new NoteSyncService(
    storage,
    aztecClient,
    {
      syncInterval: config.syncInterval,
      priceServiceUrl: config.priceServiceUrl,
      liquidationEngineUrl: config.liquidationEngineUrl,
      liquidationApiKey: config.liquidationApiKey,
    },
    logger
  );

  // Create API server
  const app = createNoteMonitorAPI(storage, syncService, logger, {
    priceServiceApiKey: config.priceServiceApiKey,
  });

  // Start services
  logger.info({ config }, 'Starting Note Monitor Service');

  // Start the sync service (fetches initial prices, then begins sync loop)
  await syncService.start();

  // Start the API server
  serve({
    fetch: app.fetch,
    port: config.apiPort,
  });

  logger.info(
    { port: config.apiPort },
    'Note Monitor API server started'
  );

  // Graceful shutdown
  process.on('SIGINT', () => {
    logger.info('Shutting down Note Monitor Service...');
    syncService.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.info('Shutting down Note Monitor Service...');
    syncService.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal error starting Note Monitor Service:', error);
  process.exit(1);
});
