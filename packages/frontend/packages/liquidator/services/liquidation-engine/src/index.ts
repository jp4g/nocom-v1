import { pino } from 'pino';
import { serve } from '@hono/node-server';
import { DEFAULT_LIQUIDATION_ENGINE_PORT } from '@liquidator/shared';
import { LiquidationChecker } from './liquidation-checker';
import { MockLiquidationPXE } from './pxe-mock';
import { createLiquidationEngineAPI } from './api';

// Load environment variables
const config = {
  pxeUrl: process.env.LIQUIDATION_ENGINE_PXE_URL || 'http://localhost:8080',
  priceServiceUrl: process.env.PRICE_SERVICE_URL || 'http://localhost:3000',
  noteMonitorUrl: process.env.NOTE_MONITOR_URL || 'http://localhost:3001',
  liquidationApiKey:
    process.env.LIQUIDATION_ENGINE_API_KEY || 'default_api_key_change_me',
  liquidatorPrivateKey:
    process.env.LIQUIDATOR_PRIVATE_KEY || 'mock_private_key',
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

// Initialize components
logger.info('Initializing Liquidation Engine...');

const checker = new LiquidationChecker(logger);
const pxeClient = new MockLiquidationPXE(
  config.pxeUrl,
  config.liquidatorPrivateKey,
  logger
);

// Create API server
const app = createLiquidationEngineAPI(
  checker,
  pxeClient,
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
