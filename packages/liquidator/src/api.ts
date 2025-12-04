import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type {
  Asset,
  AddAssetRequest,
  AddAssetResponse,
  GetPricesRequest,
  GetPricesResponse,
  EscrowAccount,
  EscrowType,
  RegisterEscrowRequest,
  RegisterEscrowResponse,
  GetPositionsResponse,
} from './utils';
import { HTTP_STATUS, isValidAssetSymbol, isValidAddress } from './utils';
import type { AssetStorage, SentinelStorage } from './storage';
import type { PriceMonitor } from './price-monitor';
import type { SentinelSyncService } from './sentinel-sync';
import type { Logger } from 'pino';

const VALID_ESCROW_TYPES: EscrowType[] = ['lending', 'stable'];

/**
 * Creates the unified API for the Liquidator Service
 * Combines price-service and liquidation-sentinel endpoints
 */
export function createLiquidatorAPI(
  assetStorage: AssetStorage,
  sentinelStorage: SentinelStorage,
  priceMonitor: PriceMonitor,
  syncService: SentinelSyncService,
  logger: Logger
) {
  const app = new Hono();

  // Enable CORS for all origins
  app.use('*', cors({
    origin: (origin) => origin || '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['Content-Length'],
    maxAge: 86400,
  }));

  // Handle preflight requests explicitly
  app.options('*', (c) => {
    return c.text('', 204);
  });

  // ==================== Health Check ====================

  app.get('/health', (c) => {
    const assetStats = {
      trackedAssets: assetStorage.getTrackedCount(),
    };
    const sentinelStats = sentinelStorage.getStats();
    const syncStatus = syncService.getStatus();

    return c.json({
      status: 'healthy',
      service: 'liquidator',
      timestamp: Date.now(),
      assets: assetStats,
      sentinel: sentinelStats,
      sync: syncStatus,
    });
  });

  // ==================== Asset/Price Endpoints ====================

  // Add asset to tracking list
  app.post('/assets', async (c) => {
    try {
      const body: AddAssetRequest = await c.req.json();
      const { symbol, name } = body;

      // Validate symbol
      if (!symbol || !isValidAssetSymbol(symbol)) {
        const response: AddAssetResponse = {
          success: false,
          error: 'Invalid asset symbol. Must be 2-10 uppercase alphanumeric characters.',
        };
        return c.json(response, HTTP_STATUS.BAD_REQUEST);
      }

      // Check if already tracked
      if (assetStorage.isTracked(symbol)) {
        const response: AddAssetResponse = {
          success: false,
          error: `Asset ${symbol} is already being tracked`,
        };
        return c.json(response, HTTP_STATUS.CONFLICT);
      }

      // Check if max limit reached
      if (assetStorage.getTrackedCount() >= 50) {
        const response: AddAssetResponse = {
          success: false,
          error: 'Maximum tracked assets limit reached',
        };
        return c.json(response, HTTP_STATUS.BAD_REQUEST);
      }

      const asset: Asset = {
        symbol: symbol.toUpperCase(),
        name: name || symbol,
      };

      assetStorage.addAsset(asset);
      logger.info({ asset }, 'Asset added to tracking list');

      const response: AddAssetResponse = {
        success: true,
        asset,
      };

      return c.json(response, HTTP_STATUS.CREATED);
    } catch (error) {
      logger.error({ error }, 'Error adding asset');
      const response: AddAssetResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      };
      return c.json(response, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  });

  // Get all tracked assets
  app.get('/assets', (c) => {
    const assets = assetStorage.getAllTrackedAssets();
    return c.json({
      assets,
      total: assets.length,
    });
  });

  // Remove asset from tracking list
  app.delete('/assets/:symbol', (c) => {
    const symbol = c.req.param('symbol').toUpperCase();

    const removed = assetStorage.removeAsset(symbol);

    if (!removed) {
      return c.json(
        { success: false, error: `Asset ${symbol} not found` },
        HTTP_STATUS.NOT_FOUND
      );
    }

    logger.info({ symbol }, 'Asset removed from tracking list');

    return c.json({ success: true, message: `Asset ${symbol} removed` });
  });

  // Get current prices for specific assets
  app.post('/prices', async (c) => {
    try {
      const body: GetPricesRequest = await c.req.json();
      const { assets } = body;

      if (!Array.isArray(assets) || assets.length === 0) {
        return c.json(
          { error: 'Assets array is required and must not be empty' },
          HTTP_STATUS.BAD_REQUEST
        );
      }

      if (assets.length > 30) {
        return c.json(
          { error: 'Maximum 30 assets can be queried at once' },
          HTTP_STATUS.BAD_REQUEST
        );
      }

      // Normalize symbols to uppercase
      const symbols = assets.map((s) => s.toUpperCase());

      // Check for non-tracked assets
      const nonTracked = symbols.filter((s) => !assetStorage.isTracked(s));
      if (nonTracked.length > 0) {
        return c.json(
          {
            error: `The following assets are not being tracked: ${nonTracked.join(', ')}`,
          },
          HTTP_STATUS.BAD_REQUEST
        );
      }

      const prices = assetStorage.getCurrentPrices(symbols);

      const response: GetPricesResponse = {
        prices,
        timestamp: Date.now(),
      };

      return c.json(response);
    } catch (error) {
      logger.error({ error }, 'Error fetching prices');
      return c.json(
        { error: 'Internal server error' },
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }
  });

  // Get all current prices
  app.get('/prices', (c) => {
    const prices = assetStorage.getAllCurrentPrices();

    const response: GetPricesResponse = {
      prices,
      timestamp: Date.now(),
    };

    return c.json(response);
  });

  // Get current update interval
  app.get('/config/update-interval', (c) => {
    const seconds = priceMonitor.getUpdateInterval();
    return c.json({
      updateIntervalSeconds: seconds,
    });
  });

  // Set update interval (in seconds)
  app.put('/config/update-interval', async (c) => {
    try {
      const body = await c.req.json();
      const { seconds } = body;

      if (typeof seconds !== 'number' || seconds < 1) {
        return c.json(
          { success: false, error: 'Invalid seconds value. Must be a positive number.' },
          HTTP_STATUS.BAD_REQUEST
        );
      }

      priceMonitor.setUpdateInterval(seconds);
      logger.info({ seconds }, 'Update interval changed via API');

      return c.json({
        success: true,
        updateIntervalSeconds: seconds,
      });
    } catch (error) {
      logger.error({ error }, 'Error setting update interval');
      return c.json(
        { success: false, error: 'Internal server error' },
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }
  });

  // Manually set price for an asset (triggers on-chain update)
  app.post('/prices/:asset/set', async (c) => {
    try {
      const asset = c.req.param('asset').toUpperCase();
      const body = await c.req.json();
      const { price } = body;

      if (typeof price !== 'number' || price <= 0) {
        return c.json(
          { success: false, error: 'Invalid price. Must be a positive number (e.g., 1.23 for $1.23).' },
          HTTP_STATUS.BAD_REQUEST
        );
      }

      // Check if asset is tracked
      if (!assetStorage.isTracked(asset)) {
        return c.json(
          { success: false, error: `Asset ${asset} is not being tracked` },
          HTTP_STATUS.NOT_FOUND
        );
      }

      logger.info({ asset, price }, 'Manual price set requested via API');

      const result = await priceMonitor.setPrice(asset, price);

      if (result.success) {
        return c.json({
          success: true,
          asset,
          price,
          txHash: result.txHash,
        });
      } else {
        return c.json(
          { success: false, error: result.error },
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        );
      }
    } catch (error) {
      logger.error({ error }, 'Error setting price');
      return c.json(
        { success: false, error: 'Internal server error' },
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }
  });

  // ==================== Escrow/Position Endpoints ====================

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
      if (sentinelStorage.isEscrowRegistered(address)) {
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

      sentinelStorage.registerEscrow(escrow);
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
    const escrows = sentinelStorage.getAllEscrows();
    return c.json({
      escrows,
      total: escrows.length,
    });
  });

  // Get all positions
  app.get('/positions', (c) => {
    const positions = sentinelStorage.getAllPositions();

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

    const result = sentinelStorage.getPositionsByCollateral(asset, limit, offset);

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

    const position = sentinelStorage.getPosition(escrowAddress);

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
    const sentinelStats = sentinelStorage.getStats();
    const trackedAssets = sentinelStorage.getTrackedCollateralAssets();
    const assetStats = {
      trackedAssets: assetStorage.getTrackedCount(),
    };

    return c.json({
      assets: assetStats,
      sentinel: {
        ...sentinelStats,
        trackedCollateralAssets: trackedAssets,
      },
    });
  });

  // Force sync all escrows (admin endpoint)
  app.post('/sync', async (c) => {
    try {
      logger.info('Force sync all escrows requested');
      const result = await syncService.forceSyncAll();
      return c.json({
        success: true,
        message: 'All escrows synced successfully',
        ...result,
      });
    } catch (error) {
      logger.error({ error }, 'Force sync all failed');
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Sync failed',
        },
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }
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

    if (!sentinelStorage.isEscrowRegistered(escrowAddress)) {
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

  // Get cached prices (from sync service)
  app.get('/cached-prices', (c) => {
    const prices = syncService.getCachedPrices();
    return c.json({
      prices,
      timestamp: Date.now(),
    });
  });

  return app;
}
