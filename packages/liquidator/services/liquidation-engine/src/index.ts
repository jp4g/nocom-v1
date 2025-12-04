import { pino } from 'pino';
import { serve } from '@hono/node-server';
import { DEFAULT_LIQUIDATION_ENGINE_PORT } from '@liquidator/shared';
import { AztecClient } from './aztec-client';
import { createLiquidationEngineAPI } from './api';

// Load environment variables
const config = {
  nodeUrl: process.env.AZTEC_NODE_URL || 'http://localhost:8080',
  priceServiceUrl: process.env.PRICE_SERVICE_URL || 'http://price-service:3000',
  noteMonitorUrl: process.env.NOTE_MONITOR_URL || 'http://note-monitor:3001',
  liquidationApiKey:
    process.env.LIQUIDATION_ENGINE_API_KEY || 'default_api_key_change_me',
  apiPort: parseInt(
    process.env.LIQUIDATION_ENGINE_API_PORT ||
      String(DEFAULT_LIQUIDATION_ENGINE_PORT)
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
  logger.info('Initializing Liquidation Engine...');

  // Initialize Aztec client
  const aztecClient = new AztecClient({ nodeUrl: config.nodeUrl }, logger);

  try {
    await aztecClient.initialize();
  } catch (error) {
    logger.error({ error }, 'Failed to initialize Aztec client - liquidations will be limited');
    // Continue without Aztec - the service can still accept requests
    // but won't be able to execute liquidations until the node is available
  }

  // Create API server
  const app = createLiquidationEngineAPI(
    aztecClient,
    {
      priceServiceUrl: config.priceServiceUrl,
      noteMonitorUrl: config.noteMonitorUrl,
      liquidationApiKey: config.liquidationApiKey,
    },
    logger
  );

  // Start services
  logger.info({ config }, 'Starting Liquidation Engine');

  // Start the API server
  serve({
    fetch: app.fetch,
    port: config.apiPort,
  });

  logger.info({ port: config.apiPort }, 'Liquidation Engine API server started');

  // Graceful shutdown
  process.on('SIGINT', () => {
    logger.info('Shutting down Liquidation Engine...');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.info('Shutting down Liquidation Engine...');
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal error starting Liquidation Engine:', error);
  process.exit(1);
});
