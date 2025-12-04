import type { Logger } from 'pino';
import type { AztecClient } from './aztec-client';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { BatchCall } from '@aztec/aztec.js/contracts';
import { simulationQueue } from './simulation-queue';

// Maximum prices per batch call (contract limitation)
const MAX_PRICES_PER_BATCH = 4;

export interface PriceUpdate {
  asset: string;
  assetAddress: AztecAddress;
  price: bigint; // Price scaled by 1e4 (e.g., $1.00 = 10000n)
}

export interface UpdateResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

/**
 * Oracle client for updating on-chain prices via the MockPriceFeed contract
 * All operations are serialized through the simulation queue
 */
export class OracleClient {
  private logger: Logger;
  private aztecClient: AztecClient;

  constructor(aztecClient: AztecClient, logger: Logger) {
    this.aztecClient = aztecClient;
    this.logger = logger;
  }

  /**
   * Get the current on-chain price for an asset
   * Uses AztecClient's queued method
   */
  async getOnChainPrice(assetAddress: AztecAddress): Promise<bigint | undefined> {
    return this.aztecClient.getOnChainPrice(assetAddress);
  }

  /**
   * Update prices on-chain
   * Batches updates into groups of MAX_PRICES_PER_BATCH
   * Uses simulation queue to prevent concurrent transaction conflicts
   */
  async updatePrices(updates: PriceUpdate[]): Promise<UpdateResult> {
    if (!this.aztecClient.isInitialized()) {
      return { success: false, error: 'Aztec client not initialized' };
    }

    if (updates.length === 0) {
      return { success: true };
    }

    return simulationQueue.enqueue(async () => {
      try {
        const oracle = this.aztecClient.getOracleContract();
        const adminAddress = this.aztecClient.getAdminAddress();
        const wallet = this.aztecClient.getWallet();

        // Chunk updates into batches of MAX_PRICES_PER_BATCH
        const batches: PriceUpdate[][] = [];
        for (let i = 0; i < updates.length; i += MAX_PRICES_PER_BATCH) {
          batches.push(updates.slice(i, i + MAX_PRICES_PER_BATCH));
        }

        this.logger.info(
          { totalUpdates: updates.length, batches: batches.length },
          'Updating on-chain prices'
        );

        // Build batch calls
        const calls = batches.map((batch) => {
          const addresses = batch.map((u) => u.assetAddress);
          const prices = batch.map((u) => u.price);

          if (batch.length === 1) {
            // Single price update
            return oracle.methods.set_price(addresses[0]!, prices[0]!);
          } else {
            // Multi-price update
            return oracle.methods.set_prices(addresses, prices);
          }
        });

        // Execute batch call
        const batchCall = new BatchCall(wallet, calls);
        const tx = await batchCall.send({ from: adminAddress });
        const receipt = await tx.wait();

        const txHash = receipt.txHash.toString();

        this.logger.info(
          {
            txHash,
            updatedAssets: updates.map((u) => u.asset),
          },
          'On-chain prices updated successfully'
        );

        return { success: true, txHash };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error({ error: errorMessage }, 'Failed to update on-chain prices');
        return { success: false, error: errorMessage };
      }
    }, `updatePrices(${updates.map(u => u.asset).join(', ')})`);
  }

  /**
   * Convert a USD price (e.g., 342.37) to the on-chain format (scaled by 1e4)
   */
  static priceToOnChain(usdPrice: number): bigint {
    // Price is stored as fixed point with 4 decimal places
    // e.g., $1.00 = 10000n, $342.37 = 3423700n
    return BigInt(Math.round(usdPrice * 10000));
  }

  /**
   * Convert an on-chain price to USD
   */
  static priceFromOnChain(onChainPrice: bigint): number {
    return Number(onChainPrice) / 10000;
  }
}
