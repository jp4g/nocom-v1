import { Hono } from 'hono';
import type { Asset, AddAssetRequest, AddAssetResponse, GetPricesRequest, GetPricesResponse } from '@liquidator/shared';
import { HTTP_STATUS, ERROR_CODES, isValidAssetSymbol } from '@liquidator/shared';
import type { AssetStorage } from './storage';
import type { PriceMonitor } from './price-monitor';
import type { Logger } from 'pino';

export function createPriceServiceAPI(storage: AssetStorage, priceMonitor: PriceMonitor, logger: Logger) {
  const app = new Hono();

  // Health check endpoint
  app.get('/health', (c) => {
    return c.json({
      status: 'healthy',
      service: 'price-service',
      timestamp: Date.now(),
      trackedAssets: storage.getTrackedCount(),
    });
  });

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
      if (storage.isTracked(symbol)) {
        const response: AddAssetResponse = {
          success: false,
          error: `Asset ${symbol} is already being tracked`,
        };
        return c.json(response, HTTP_STATUS.CONFLICT);
      }

      // Check if max limit reached
      if (storage.getTrackedCount() >= 50) {
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

      storage.addAsset(asset);
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
    const assets = storage.getAllTrackedAssets();
    return c.json({
      assets,
      total: assets.length,
    });
  });

  // Remove asset from tracking list
  app.delete('/assets/:symbol', (c) => {
    const symbol = c.req.param('symbol').toUpperCase();

    const removed = storage.removeAsset(symbol);

    if (!removed) {
      return c.json(
        { success: false, error: `Asset ${symbol} not found` },
        HTTP_STATUS.NOT_FOUND
      );
    }

    logger.info({ symbol }, 'Asset removed from tracking list');

    return c.json({ success: true, message: `Asset ${symbol} removed` });
  });

  // Get current prices for assets
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
      const nonTracked = symbols.filter((s) => !storage.isTracked(s));
      if (nonTracked.length > 0) {
        return c.json(
          {
            error: `The following assets are not being tracked: ${nonTracked.join(', ')}`,
          },
          HTTP_STATUS.BAD_REQUEST
        );
      }

      const prices = storage.getCurrentPrices(symbols);

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
    const prices = storage.getAllCurrentPrices();

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
      if (!storage.isTracked(asset)) {
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

  return app;
}
