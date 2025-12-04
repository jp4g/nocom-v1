import { Hono } from 'hono';
import type { PriceUpdateNotification, LiquidationTriggerRequest, LiquidationTriggerResponse } from '@liquidator/shared';
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

  // Liquidation trigger endpoint (from note-monitor when health factor is low)
  app.post('/trigger-liquidation', async (c) => {
    try {
      // Check authentication
      const apiKey = c.req.header('X-API-Key');

      if (!apiKey || apiKey !== config.liquidationApiKey) {
        logger.warn('Unauthorized liquidation trigger attempt');
        return c.json(
          { success: false, error: 'Unauthorized' } as LiquidationTriggerResponse,
          HTTP_STATUS.UNAUTHORIZED
        );
      }

      const body: LiquidationTriggerRequest = await c.req.json();
      const { escrow, positionData, healthFactor, collateralPrice, debtPrice } = body;

      logger.info(
        {
          escrowAddress: escrow.address,
          escrowType: escrow.type,
          healthFactor,
          collateralPrice,
          debtPrice,
          collateralAmount: positionData.collateralAmount,
          totalDebt: positionData.totalDebt,
        },
        'Liquidation trigger received'
      );

      // Execute liquidation in the background
      executeLiquidation(body).catch((error) => {
        logger.error({ error, escrow: escrow.address }, 'Error executing liquidation');
      });

      return c.json({
        success: true,
        message: `Liquidation queued for escrow ${escrow.address}`,
      } as LiquidationTriggerResponse);
    } catch (error) {
      logger.error({ error }, 'Error handling liquidation trigger');
      return c.json(
        { success: false, error: 'Internal server error' } as LiquidationTriggerResponse,
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }
  });

  /**
   * Execute a liquidation based on the trigger request
   */
  async function executeLiquidation(request: LiquidationTriggerRequest): Promise<void> {
    const { escrow, positionData, collateralPrice, debtPrice } = request;

    try {
      logger.info({ escrow: escrow.address }, 'Starting liquidation execution');

      // Calculate liquidation amount (50% of debt max)
      const totalDebt = BigInt(positionData.totalDebt);
      const maxLiquidationAmount = totalDebt / 2n;

      // Convert to number for the mock PXE (will be replaced with real implementation)
      const WAD = 10n ** 18n;
      const liquidationAmountNum = Number(maxLiquidationAmount) / Number(WAD);

      // Calculate collateral to seize with bonus (10%)
      const collateralToSeize = (liquidationAmountNum * debtPrice / collateralPrice) * 1.1;

      const params = {
        escrowAddress: escrow.address,
        collateralAsset: escrow.collateralToken,
        debtAsset: escrow.debtToken,
        liquidationAmount: liquidationAmountNum,
        collateralToSeize,
        expectedProfit: collateralToSeize * 0.1 * collateralPrice, // 10% bonus
      };

      logger.info({ params }, 'Liquidation parameters calculated');

      // Execute using the mock PXE client (to be replaced with real Aztec client)
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
          'Liquidation execution failed'
        );
      }
    } catch (error) {
      logger.error({ error, escrow: escrow.address }, 'Error in liquidation execution');
      throw error;
    }
  }

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
