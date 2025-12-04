import { Hono } from 'hono';
import type { PriceUpdateNotification, LiquidationTriggerRequest, LiquidationTriggerResponse } from '@liquidator/shared';
import { HTTP_STATUS } from '@liquidator/shared';
import type { AztecClient } from './aztec-client';
import type { Logger } from 'pino';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import type { NocomEscrowV1Contract, NocomStableEscrowV1Contract } from '@nocom-v1/contracts/artifacts';
// Import authwit creation helpers for liquidation
import { privateTransferAuthwit, burnPrivateAuthwit } from '@nocom-v1/contracts/contract';
import { PRICE_BASE } from '@nocom-v1/contracts/constants';

export interface ServiceConfig {
  priceServiceUrl: string;
  noteMonitorUrl: string;
  liquidationApiKey: string;
}

export function createLiquidationEngineAPI(
  aztecClient: AztecClient,
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
      aztecClientInitialized: aztecClient.isInitialized(),
      registeredEscrows: aztecClient.getAllRegisteredEscrows().length,
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

      // Check if Aztec client is initialized
      if (!aztecClient.isInitialized()) {
        logger.error('Aztec client not initialized, cannot execute liquidation');
        return c.json({
          success: false,
          error: 'Aztec client not initialized',
        } as LiquidationTriggerResponse, HTTP_STATUS.INTERNAL_SERVER_ERROR);
      }

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
    const startTime = Date.now();

    logger.info(
      {
        escrow: escrow.address,
        type: escrow.type,
        healthFactor: request.healthFactor,
        collateralPrice,
        debtPrice,
      },
      'Starting liquidation execution'
    );

    try {
      // Ensure the escrow contract is registered with our client
      const registeredEscrow = await aztecClient.ensureEscrowRegistered(
        escrow.address,
        escrow.type,
        escrow.instance,
        escrow.secretKey
      );

      logger.info(
        { escrow: escrow.address, contractRegistered: true },
        'Escrow contract ready for liquidation'
      );

      // Calculate liquidation amount (50% of debt max)
      const totalDebt = BigInt(positionData.totalDebt);
      const repayAmount = totalDebt / 2n;

      // Convert prices to on-chain format (scaled by PRICE_BASE = 10000)
      const collateralPriceOnChain = BigInt(Math.round(collateralPrice * PRICE_BASE));
      const debtPriceOnChain = BigInt(Math.round(debtPrice * PRICE_BASE));

      // Get wallet and admin address
      const wallet = aztecClient.getWallet();
      const adminAddress = aztecClient.getAdminAddress();
      const poolAddress = AztecAddress.fromString(escrow.poolAddress);

      // Convert to human-readable for logging
      const WAD = 10n ** 18n;
      const repayAmountNum = Number(repayAmount) / Number(WAD);

      logger.info(
        {
          escrow: escrow.address,
          repayAmount: repayAmountNum,
          collateralPriceOnChain: collateralPriceOnChain.toString(),
          debtPriceOnChain: debtPriceOnChain.toString(),
        },
        'Liquidation parameters calculated'
      );

      if (escrow.type === 'lending') {
        // For lending escrow: liquidator repays debt tokens to the pool
        const debtTokenContract = aztecClient.getTokenContract(escrow.debtToken);
        if (!debtTokenContract) {
          throw new Error(`Debt token contract not found for address: ${escrow.debtToken}`);
        }

        logger.info(
          { escrow: escrow.address, debtToken: escrow.debtToken },
          'Creating authwit for debt token transfer'
        );

        // Create authwit for transferring debt tokens to the pool
        const { authwit, nonce } = await privateTransferAuthwit(
          wallet,
          adminAddress,
          debtTokenContract,
          'transfer_private_to_public',
          poolAddress,
          poolAddress,
          repayAmount
        );

        logger.info({ escrow: escrow.address }, 'Executing lending liquidation transaction');

        // Execute liquidation on the escrow contract
        const escrowContract = registeredEscrow.contract as NocomEscrowV1Contract;
        const receipt = await escrowContract.methods
          .liquidate(repayAmount, nonce, collateralPriceOnChain, debtPriceOnChain)
          .send({ from: adminAddress, authWitnesses: [authwit] })
          .wait();

        const duration = Date.now() - startTime;
        logger.info(
          {
            escrow: escrow.address,
            txHash: receipt.txHash.toString(),
            status: receipt.status,
            repayAmount: repayAmountNum,
            duration,
          },
          'Lending liquidation executed successfully'
        );
      } else {
        // For stable escrow: liquidator burns zUSD to repay debt
        const zusdTokenContract = aztecClient.getTokenContractBySymbol('ZUSD');
        if (!zusdTokenContract) {
          throw new Error('ZUSD token contract not found');
        }

        logger.info(
          { escrow: escrow.address },
          'Creating authwit for zUSD burn'
        );

        // Create authwit for burning zUSD
        const { authwit, nonce } = await burnPrivateAuthwit(
          wallet,
          adminAddress,
          zusdTokenContract,
          poolAddress,
          repayAmount
        );

        logger.info({ escrow: escrow.address }, 'Executing stable liquidation transaction');

        // Execute liquidation on the stable escrow contract
        const escrowContract = registeredEscrow.contract as NocomStableEscrowV1Contract;
        const receipt = await escrowContract.methods
          .liquidate(repayAmount, nonce, collateralPriceOnChain)
          .send({ from: adminAddress, authWitnesses: [authwit] })
          .wait();

        const duration = Date.now() - startTime;
        logger.info(
          {
            escrow: escrow.address,
            txHash: receipt.txHash.toString(),
            status: receipt.status,
            repayAmount: repayAmountNum,
            duration,
          },
          'Stable liquidation executed successfully'
        );
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(
        {
          error,
          escrow: escrow.address,
          type: escrow.type,
          duration,
        },
        'Liquidation execution failed'
      );
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

      // Note: The note-monitor now handles health checking and sends
      // liquidation triggers directly to us. This endpoint is mostly
      // for backwards compatibility with the price-service notifications.
      logger.info({ asset }, 'Liquidation processing completed (handled by note-monitor)');
    } catch (error) {
      logger.error({ error, asset }, 'Error in liquidation processing');
      throw error;
    }
  }

  return app;
}
