import { pino } from 'pino';
import { serve } from '@hono/node-server';
import {
  DEFAULT_SYNC_INTERVAL,
  DEFAULT_NOTE_MONITOR_PORT,
} from '@liquidator/shared';
import { NoteMonitorStorage } from './storage';
import { MockPXEClient } from './pxe-mock';
import { NoteSyncService } from './note-sync';
import { createNoteMonitorAPI } from './api';

// Load environment variables
const config = {
  pxeUrl: process.env.NOTE_MONITOR_PXE_URL || 'http://localhost:8080',
  syncInterval: parseInt(
    process.env.SYNC_INTERVAL || String(DEFAULT_SYNC_INTERVAL)
  ),
  apiPort: parseInt(
    process.env.NOTE_MONITOR_API_PORT || String(DEFAULT_NOTE_MONITOR_PORT)
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
logger.info('Initializing Note Monitor Service...');

const storage = new NoteMonitorStorage();
const pxeClient = new MockPXEClient(config.pxeUrl, logger);

const syncService = new NoteSyncService(
  storage,
  pxeClient,
  {
    syncInterval: config.syncInterval,
  },
  logger
);

// Create API server
const app = createNoteMonitorAPI(storage, syncService, logger);

// Start services
logger.info({ config }, 'Starting Note Monitor Service');

// Start the sync service
syncService.start();

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
