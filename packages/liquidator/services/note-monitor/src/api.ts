import { Hono } from 'hono';
import type {
  EscrowAccount,
  RegisterEscrowRequest,
  RegisterEscrowResponse,
  GetPositionsRequest,
  GetPositionsResponse,
} from '@liquidator/shared';
import { HTTP_STATUS, isValidAddress } from '@liquidator/shared';
import type { NoteMonitorStorage } from './storage';
import type { NoteSyncService } from './note-sync';
import type { Logger } from 'pino';

export function createNoteMonitorAPI(
  storage: NoteMonitorStorage,
  syncService: NoteSyncService,
  logger: Logger
) {
  const app = new Hono();

  // Health check endpoint
  app.get('/health', (c) => {
    const stats = storage.getStats();
    const syncStatus = syncService.getStatus();

    return c.json({
      status: 'healthy',
      service: 'note-monitor',
      timestamp: Date.now(),
      ...stats,
      sync: syncStatus,
    });
  });

  // Register new escrow account
  app.post('/escrows', async (c) => {
    try {
      const body: RegisterEscrowRequest = await c.req.json();
      const { address } = body;

      // Validate address
      if (!address || !isValidAddress(address)) {
        const response: RegisterEscrowResponse = {
          success: false,
          error: 'Invalid escrow address format. Must be a valid Ethereum address.',
        };
        return c.json(response, HTTP_STATUS.BAD_REQUEST);
      }

      // Check if already registered
      if (storage.isEscrowRegistered(address)) {
        const response: RegisterEscrowResponse = {
          success: false,
          error: `Escrow ${address} is already registered`,
        };
        return c.json(response, HTTP_STATUS.CONFLICT);
      }

      const escrow: EscrowAccount = {
        address,
        registeredAt: Date.now(),
      };

      storage.registerEscrow(escrow);
      logger.info({ escrow }, 'Escrow registered');

      // Trigger immediate sync for this escrow
      syncService.forceSyncEscrow(address).catch((error) => {
        logger.error({ error, address }, 'Failed to force sync new escrow');
      });

      const response: RegisterEscrowResponse = {
        success: true,
        escrow,
      };

      return c.json(response, HTTP_STATUS.CREATED);
    } catch (error) {
      logger.error({ error }, 'Error registering escrow');
      const response: RegisterEscrowResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      };
      return c.json(response, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  });

  // Get all registered escrows
  app.get('/escrows', (c) => {
    const escrows = storage.getAllEscrows();
    return c.json({
      escrows,
      total: escrows.length,
    });
  });

  // Get all positions
  app.get('/positions', (c) => {
    const positions = storage.getAllPositions();

    const response: GetPositionsResponse = {
      positions,
      total: positions.length,
      limit: positions.length,
      offset: 0,
    };

    return c.json(response);
  });

  // Get positions by collateral asset (with pagination)
  app.get('/positions/by-collateral/:asset', (c) => {
    const asset = c.req.param('asset').toUpperCase();
    const limitParam = c.req.query('limit');
    const offsetParam = c.req.query('offset');

    const limit = limitParam ? parseInt(limitParam) : 100;
    const offset = offsetParam ? parseInt(offsetParam) : 0;

    if (isNaN(limit) || limit < 1 || limit > 1000) {
      return c.json(
        { error: 'Invalid limit. Must be between 1 and 1000' },
        HTTP_STATUS.BAD_REQUEST
      );
    }

    if (isNaN(offset) || offset < 0) {
      return c.json(
        { error: 'Invalid offset. Must be >= 0' },
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const result = storage.getPositionsByCollateral(asset, limit, offset);

    const response: GetPositionsResponse = {
      positions: result.positions,
      total: result.total,
      limit,
      offset,
    };

    return c.json(response);
  });

  // Get position for specific escrow
  app.get('/positions/:escrowAddress', (c) => {
    const escrowAddress = c.req.param('escrowAddress');

    if (!isValidAddress(escrowAddress)) {
      return c.json(
        { error: 'Invalid escrow address format' },
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const position = storage.getPosition(escrowAddress);

    if (!position) {
      return c.json(
        { error: `No position found for escrow ${escrowAddress}` },
        HTTP_STATUS.NOT_FOUND
      );
    }

    return c.json({ position });
  });

  // Get statistics
  app.get('/stats', (c) => {
    const stats = storage.getStats();
    const trackedAssets = storage.getTrackedCollateralAssets();

    return c.json({
      ...stats,
      trackedCollateralAssets: trackedAssets,
    });
  });

  // Force sync specific escrow (admin endpoint)
  app.post('/sync/:escrowAddress', async (c) => {
    const escrowAddress = c.req.param('escrowAddress');

    if (!isValidAddress(escrowAddress)) {
      return c.json(
        { error: 'Invalid escrow address format' },
        HTTP_STATUS.BAD_REQUEST
      );
    }

    if (!storage.isEscrowRegistered(escrowAddress)) {
      return c.json(
        { error: `Escrow ${escrowAddress} is not registered` },
        HTTP_STATUS.NOT_FOUND
      );
    }

    try {
      await syncService.forceSyncEscrow(escrowAddress);
      return c.json({
        success: true,
        message: `Escrow ${escrowAddress} synced successfully`,
      });
    } catch (error) {
      logger.error({ error, escrowAddress }, 'Force sync failed');
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Sync failed',
        },
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }
  });

  return app;
}
