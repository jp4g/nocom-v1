import type { Logger } from 'pino';
import type { EscrowAccount } from './utils';
import type { AztecClient, PositionData } from './aztec-client';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import type { NocomEscrowV1Contract, NocomStableEscrowV1Contract } from '@nocom-v1/contracts/artifacts';
import { privateTransferAuthwit, burnPrivateAuthwit } from '@nocom-v1/contracts/contract';
import { PRICE_BASE } from '@nocom-v1/contracts/constants';
import { simulationQueue } from './simulation-queue';

export interface LiquidationRequest {
  escrow: EscrowAccount;
  positionData: PositionData;
  totalDebt: bigint;
  healthFactor: bigint;
  collateralPrice: bigint; // scaled by PRICE_BASE
  debtPrice: bigint; // scaled by PRICE_BASE
}

export interface LiquidationResult {
  success: boolean;
  txHash?: string;
  error?: string;
  duration: number;
}

/**
 * Liquidation Executor - handles the actual on-chain liquidation transactions
 * All operations are serialized through the simulation queue
 */
export class LiquidationExecutor {
  private aztecClient: AztecClient;
  private logger: Logger;

  constructor(aztecClient: AztecClient, logger: Logger) {
    this.aztecClient = aztecClient;
    this.logger = logger;
  }

  /**
   * Execute a liquidation for the given escrow
   * Uses simulation queue to prevent concurrent transaction conflicts
   */
  async executeLiquidation(request: LiquidationRequest): Promise<LiquidationResult> {
    const { escrow, positionData, totalDebt, collateralPrice, debtPrice } = request;
    const startTime = Date.now();

    // Convert prices to USD for logging
    const collateralPriceUSD = Number(collateralPrice) / Number(PRICE_BASE);
    const debtPriceUSD = Number(debtPrice) / Number(PRICE_BASE);

    this.logger.info(
      {
        escrow: escrow.address,
        type: escrow.type,
        healthFactor: request.healthFactor.toString(),
        collateralPriceUSD,
        debtPriceUSD,
      },
      'Starting liquidation execution'
    );

    return simulationQueue.enqueue(async () => {
      try {
        // Ensure the escrow contract is registered
        const registeredEscrow = await this.aztecClient.registerEscrow(
          escrow.address,
          escrow.type,
          escrow.instance,
          escrow.secretKey
        );

        this.logger.info(
          { escrow: escrow.address, contractRegistered: true },
          'Escrow contract ready for liquidation'
        );

        // Calculate liquidation amount (49% of debt)
        const repayAmount = (totalDebt * 49n) / 100n;

        // Prices are already BigInt scaled by PRICE_BASE
        const collateralPriceOnChain = collateralPrice;
        const debtPriceOnChain = debtPrice;

        // Get wallet and admin address
        const wallet = this.aztecClient.getWallet();
        const adminAddress = this.aztecClient.getAdminAddress();
        const poolAddress = AztecAddress.fromString(escrow.poolAddress);

        // Convert to human-readable for logging
        const WAD = 10n ** 18n;
        const repayAmountNum = Number(repayAmount) / Number(WAD);

        this.logger.info(
          {
            escrow: escrow.address,
            repayAmount: repayAmountNum,
            collateralPriceOnChain: collateralPriceOnChain.toString(),
            debtPriceOnChain: debtPriceOnChain.toString(),
          },
          'Liquidation parameters calculated'
        );

        let txHash: string;

        if (escrow.type === 'lending') {
          txHash = await this.executeLendingLiquidation(
            escrow,
            registeredEscrow.contract as NocomEscrowV1Contract,
            wallet,
            adminAddress,
            poolAddress,
            repayAmount,
            collateralPriceOnChain,
            debtPriceOnChain
          );
        } else {
          txHash = await this.executeStableLiquidation(
            escrow,
            registeredEscrow.contract as NocomStableEscrowV1Contract,
            wallet,
            adminAddress,
            poolAddress,
            repayAmount,
            collateralPriceOnChain
          );
        }

        const duration = Date.now() - startTime;
        this.logger.info(
          {
            escrow: escrow.address,
            txHash,
            repayAmount: repayAmountNum,
            duration,
          },
          'Liquidation executed successfully'
        );

        return {
          success: true,
          txHash,
          duration,
        };
      } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        this.logger.error(
          {
            error,
            escrow: escrow.address,
            type: escrow.type,
            duration,
          },
          'Liquidation execution failed'
        );

        return {
          success: false,
          error: errorMessage,
          duration,
        };
      }
    }, `executeLiquidation(${escrow.address})`);
  }

  /**
   * Execute liquidation on a lending escrow
   */
  private async executeLendingLiquidation(
    escrow: EscrowAccount,
    escrowContract: NocomEscrowV1Contract,
    wallet: any,
    adminAddress: AztecAddress,
    poolAddress: AztecAddress,
    repayAmount: bigint,
    collateralPriceOnChain: bigint,
    debtPriceOnChain: bigint
  ): Promise<string> {
    // Get debt token contract for authwit
    const debtTokenContract = this.aztecClient.getTokenContract(escrow.debtToken);
    if (!debtTokenContract) {
      throw new Error(`Debt token contract not found for address: ${escrow.debtToken}`);
    }

    this.logger.info(
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

    this.logger.info({ escrow: escrow.address }, 'Executing lending liquidation transaction');

    // Execute liquidation on the escrow contract
    const receipt = await escrowContract.methods
      .liquidate(repayAmount, nonce, collateralPriceOnChain, debtPriceOnChain)
      .send({ from: adminAddress, authWitnesses: [authwit] })
      .wait();

    return receipt.txHash.toString();
  }

  /**
   * Execute liquidation on a stable escrow
   */
  private async executeStableLiquidation(
    escrow: EscrowAccount,
    escrowContract: NocomStableEscrowV1Contract,
    wallet: any,
    adminAddress: AztecAddress,
    poolAddress: AztecAddress,
    repayAmount: bigint,
    collateralPriceOnChain: bigint
  ): Promise<string> {
    // Get zUSD token contract for authwit
    const zusdTokenContract = this.aztecClient.getTokenContractBySymbol('ZUSD');
    if (!zusdTokenContract) {
      throw new Error('ZUSD token contract not found');
    }

    this.logger.info(
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

    this.logger.info({ escrow: escrow.address }, 'Executing stable liquidation transaction');

    // Execute liquidation on the stable escrow contract
    const receipt = await escrowContract.methods
      .liquidate(repayAmount, nonce, collateralPriceOnChain)
      .send({ from: adminAddress, authWitnesses: [authwit] })
      .wait();

    return receipt.txHash.toString();
  }
}
