import { Hono } from 'hono';
import type { PriceUpdateNotification } from '@liquidator/shared';
import { HTTP_STATUS } from '@liquidator/shared';
import type { LiquidationChecker } from './liquidation-checker';
import type { MockLiquidationPXE } from './pxe-mock';
import type { Logger } from 'pino';

export interface ServiceConfig {
  priceServiceUrl: string;
  noteMonitorUrl: string;
  liquidationApiKey: string;
}

export function createLiquidationEngineAPI(
  checker: LiquidationChecker,
  pxeClient: MockLiquidationPXE,
  config: ServiceConfig,
  logger: Logger
) {
  const app = new Hono();

  // Health check endpoint
  app.get('/health', (c) => {
    return c.json({
      status: 'healthy',
      service: 'liquidation-engine',
      timestamp: Date.now(),
    });
  });

  // Price update notification endpoint (authenticated)
  app.post('/price-update', async (c) => {
    try {
      // Check authentication
      const apiKey = c.req.header('X-API-Key');

      if (!apiKey || apiKey !== config.liquidationApiKey) {
        logger.warn('Unauthorized price update attempt');
        return c.json(
          { error: 'Unauthorized' },
          HTTP_STATUS.UNAUTHORIZED
        );
      }

      const body: PriceUpdateNotification = await c.req.json();
      const { asset, newPrice } = body;

      logger.info(
        { asset, newPrice },
        'Price update notification received'
      );

      // Process liquidations for this asset in the background
      processLiquidationsForAsset(asset, newPrice).catch((error) => {
        logger.error({ error, asset }, 'Error processing liquidations');
      });

      return c.json({
        success: true,
        message: `Processing liquidations for ${asset}`,
      });
    } catch (error) {
      logger.error({ error }, 'Error handling price update');
      return c.json(
        { error: 'Internal server error' },
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }
  });

  /**
   * Process liquidations for a specific collateral asset
   */
  async function processLiquidationsForAsset(
    asset: string,
    assetPrice: number
  ): Promise<void> {
    try {
      logger.info({ asset }, 'Starting liquidation check');

      // 1. Fetch positions with this collateral asset from note monitor
      const positionsResponse = await fetch(
        `${config.noteMonitorUrl}/positions/by-collateral/${asset}`
      );

      if (!positionsResponse.ok) {
        throw new Error(
          `Failed to fetch positions: ${positionsResponse.status}`
        );
      }

      const positionsData = await positionsResponse.json();
      const positions = positionsData.positions;

      if (positions.length === 0) {
        logger.info({ asset }, 'No positions found for asset');
        return;
      }

      logger.info(
        { asset, positionCount: positions.length },
        'Positions fetched'
      );

      // 2. Check positions for liquidation eligibility
      const prices = new Map([[asset, assetPrice]]);
      const { eligiblePositions, liquidationParams } =
        checker.checkPositions(positions, prices);

      if (liquidationParams.length === 0) {
        logger.info({ asset }, 'No liquidatable positions found');
        return;
      }

      logger.info(
        {
          asset,
          liquidatableCount: liquidationParams.length,
        },
        'Liquidatable positions found'
      );

      // 3. Execute liquidations
      for (const params of liquidationParams) {
        try {
          const result = await pxeClient.executeLiquidation(params);

          if (result.success) {
            logger.info(
              {
                escrow: result.escrowAddress,
                txHash: result.txHash,
                amount: result.liquidationAmount,
              },
              'Liquidation executed successfully'
            );
          } else {
            logger.error(
              {
                escrow: result.escrowAddress,
                error: result.error,
              },
              'Liquidation failed'
            );
          }
        } catch (error) {
          logger.error(
            { error, escrow: params.escrowAddress },
            'Error executing liquidation'
          );
          // Continue with other liquidations
        }
      }

      logger.info({ asset }, 'Liquidation processing completed');
    } catch (error) {
      logger.error({ error, asset }, 'Error in liquidation processing');
      throw error;
    }
  }

  return app;
}
