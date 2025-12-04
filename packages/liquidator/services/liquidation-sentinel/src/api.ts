import { Hono } from 'hono';
import type {
  EscrowAccount,
  EscrowType,
  RegisterEscrowRequest,
  RegisterEscrowResponse,
  GetPositionsResponse,
  PriceUpdateNotification,
} from '@liquidator/shared';
import { HTTP_STATUS, isValidAddress } from '@liquidator/shared';
import type { SentinelStorage } from './storage';
import type { SentinelSyncService } from './sentinel-sync';
import type { Logger } from 'pino';

const VALID_ESCROW_TYPES: EscrowType[] = ['lending', 'stable'];

export interface SentinelAPIConfig {
  priceServiceApiKey?: string; // API key for price-service to push updates
}

export function createSentinelAPI(
  storage: SentinelStorage,
  syncService: SentinelSyncService,
  logger: Logger,
  config: SentinelAPIConfig = {}
) {
  const app = new Hono();

  // Health check endpoint
  app.get('/health', (c) => {
    const stats = storage.getStats();
    const syncStatus = syncService.getStatus();

    return c.json({
      status: 'healthy',
      service: 'liquidation-sentinel',
      timestamp: Date.now(),
      ...stats,
      sync: syncStatus,
    });
  });

  // Register new escrow account
  app.post('/escrows', async (c) => {
    try {
      const body: RegisterEscrowRequest = await c.req.json();
      const { address, type, poolAddress, collateralToken, debtToken, instance, secretKey } = body;

      // Validate address
      if (!address || !isValidAddress(address)) {
        const response: RegisterEscrowResponse = {
          success: false,
          error: 'Invalid escrow address format.',
        };
        return c.json(response, HTTP_STATUS.BAD_REQUEST);
      }

      // Validate type
      if (!type || !VALID_ESCROW_TYPES.includes(type)) {
        const response: RegisterEscrowResponse = {
          success: false,
          error: `Invalid escrow type. Must be one of: ${VALID_ESCROW_TYPES.join(', ')}`,
        };
        return c.json(response, HTTP_STATUS.BAD_REQUEST);
      }

      // Validate pool address
      if (!poolAddress || !isValidAddress(poolAddress)) {
        const response: RegisterEscrowResponse = {
          success: false,
          error: 'Invalid pool address format.',
        };
        return c.json(response, HTTP_STATUS.BAD_REQUEST);
      }

      // Validate token addresses
      if (!collateralToken || !isValidAddress(collateralToken)) {
        const response: RegisterEscrowResponse = {
          success: false,
          error: 'Invalid collateral token address format.',
        };
        return c.json(response, HTTP_STATUS.BAD_REQUEST);
      }

      if (!debtToken || !isValidAddress(debtToken)) {
        const response: RegisterEscrowResponse = {
          success: false,
          error: 'Invalid debt token address format.',
        };
        return c.json(response, HTTP_STATUS.BAD_REQUEST);
      }

      // Validate instance JSON
      if (!instance || typeof instance !== 'string') {
        const response: RegisterEscrowResponse = {
          success: false,
          error: 'Missing or invalid contract instance JSON.',
        };
        return c.json(response, HTTP_STATUS.BAD_REQUEST);
      }

      // Validate secret key
      if (!secretKey || typeof secretKey !== 'string') {
        const response: RegisterEscrowResponse = {
          success: false,
          error: 'Missing or invalid secret key.',
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
        type,
        poolAddress,
        collateralToken,
        debtToken,
        instance,
        secretKey,
        registeredAt: Date.now(),
      };

      storage.registerEscrow(escrow);
      logger.info({ address, type, poolAddress }, 'Escrow registered');

      // Register with sync service for monitoring
      syncService.registerEscrowForSync(escrow).catch((error) => {
        logger.error({ error, address }, 'Failed to register escrow for sync');
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

  // Price update endpoint (called by price-service when prices change)
  app.post('/price-update', async (c) => {
    try {
      // Validate API key if configured
      if (config.priceServiceApiKey) {
        const apiKey = c.req.header('X-API-Key');
        if (!apiKey || apiKey !== config.priceServiceApiKey) {
          logger.warn('Unauthorized price update attempt');
          return c.json(
            { success: false, error: 'Unauthorized' },
            HTTP_STATUS.UNAUTHORIZED
          );
        }
      }

      const body: PriceUpdateNotification = await c.req.json();
      const { asset, newPrice } = body;

      if (!asset || typeof asset !== 'string') {
        return c.json(
          { success: false, error: 'Invalid asset' },
          HTTP_STATUS.BAD_REQUEST
        );
      }

      if (typeof newPrice !== 'number' || newPrice <= 0) {
        return c.json(
          { success: false, error: 'Invalid price' },
          HTTP_STATUS.BAD_REQUEST
        );
      }

      logger.info({ asset, newPrice }, 'Price update received from price-service');

      // Handle price update (updates cache and checks health for affected escrows)
      syncService.handlePriceUpdate(asset, newPrice).catch((error) => {
        logger.error({ error, asset }, 'Error handling price update');
      });

      return c.json({
        success: true,
        message: `Price update received for ${asset}`,
      });
    } catch (error) {
      logger.error({ error }, 'Error processing price update');
      return c.json(
        { success: false, error: 'Internal server error' },
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }
  });

  // Get cached prices
  app.get('/prices', (c) => {
    const prices = syncService.getCachedPrices();
    return c.json({
      prices,
      timestamp: Date.now(),
    });
  });

  return app;
}
