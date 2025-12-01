import type { Logger } from 'pino';

/**
 * Mock Price Oracle Contract Interface
 *
 * This mocks interactions with the on-chain price oracle contract.
 * In Phase 8, replace with actual contract calls.
 */
export class MockPriceOracle {
  private logger: Logger;
  private contractAddress: string;
  private onChainPrices: Map<string, { price: number; timestamp: number }>;

  constructor(contractAddress: string, logger: Logger) {
    this.logger = logger;
    this.contractAddress = contractAddress;
    this.onChainPrices = new Map();
  }

  /**
   * Get the last price stored on-chain for an asset
   * MOCK: Returns from in-memory storage
   */
  async getOnChainPrice(asset: string): Promise<number | undefined> {
    this.logger.debug({ asset }, 'Getting on-chain price (MOCK)');

    // Simulate blockchain read delay
    await new Promise((resolve) => setTimeout(resolve, 50));

    const data = this.onChainPrices.get(asset);
    return data?.price;
  }

  /**
   * Update the price on-chain
   * MOCK: Stores in memory and simulates transaction
   */
  async updateOnChainPrice(
    asset: string,
    newPrice: number
  ): Promise<{ success: boolean; txHash: string }> {
    this.logger.info({ asset, newPrice }, 'Updating on-chain price (MOCK)');

    // Simulate transaction delay
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Store the price
    this.onChainPrices.set(asset, {
      price: newPrice,
      timestamp: Date.now(),
    });

    // Generate a fake transaction hash
    const txHash = `0x${Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('')}`;

    this.logger.info(
      { asset, newPrice, txHash },
      'On-chain price updated successfully (MOCK)'
    );

    return {
      success: true,
      txHash,
    };
  }

  /**
   * Get timestamp of last on-chain update
   * MOCK: Returns from in-memory storage
   */
  async getLastUpdateTime(asset: string): Promise<number | undefined> {
    const data = this.onChainPrices.get(asset);
    return data?.timestamp;
  }

  /**
   * Initialize with a starting price (for testing)
   */
  initializePrice(asset: string, price: number): void {
    this.onChainPrices.set(asset, {
      price,
      timestamp: Date.now(),
    });
    this.logger.debug({ asset, price }, 'Initialized on-chain price (MOCK)');
  }
}

/*
 * IMPLEMENTATION NOTE FOR PHASE 8:
 *
 * Replace this mock with actual smart contract interactions:
 *
 * 1. Import your contract ABI and connect using ethers.js or web3.js
 * 2. Implement getOnChainPrice() to read from the contract
 * 3. Implement updateOnChainPrice() to submit transactions:
 *    - Build the transaction with proper gas estimation
 *    - Sign with the service's private key
 *    - Submit to the blockchain
 *    - Wait for confirmation
 *    - Handle reorgs and failures
 * 4. Add proper error handling for blockchain errors
 * 5. Implement transaction retry logic with increasing gas
 *
 * Example real implementation:
 *
 * import { ethers } from 'ethers';
 *
 * class PriceOracle {
 *   private contract: ethers.Contract;
 *   private wallet: ethers.Wallet;
 *
 *   constructor(contractAddress: string, privateKey: string, rpcUrl: string) {
 *     const provider = new ethers.JsonRpcProvider(rpcUrl);
 *     this.wallet = new ethers.Wallet(privateKey, provider);
 *     this.contract = new ethers.Contract(contractAddress, ABI, this.wallet);
 *   }
 *
 *   async getOnChainPrice(asset: string): Promise<number> {
 *     const price = await this.contract.getPrice(asset);
 *     return Number(price);
 *   }
 *
 *   async updateOnChainPrice(asset: string, newPrice: number) {
 *     const tx = await this.contract.updatePrice(asset, newPrice);
 *     const receipt = await tx.wait();
 *     return { success: true, txHash: receipt.hash };
 *   }
 * }
 */
