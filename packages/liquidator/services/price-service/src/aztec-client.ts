import type { Logger } from 'pino';
import { createAztecNodeClient } from '@aztec/aztec.js/node';
import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import { TestWallet } from '@aztec/test-wallet/server';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { ContractInstanceWithAddressSchema } from '@aztec/stdlib/contract';
import {
  MockPriceFeedContract,
  MockPriceFeedContractArtifact,
} from '@nocom-v1/contracts/artifacts';
import deployments from '../../../deployments.json' assert { type: 'json' };

// Override global fetch to add ngrok header (bypasses browser warning)
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  headers.set('ngrok-skip-browser-warning', 'true');
  return originalFetch(input, { ...init, headers });
};

export interface AztecClientConfig {
  nodeUrl: string;
}

/**
 * Aztec client for interacting with the price oracle contract
 */
export class AztecClient {
  private logger: Logger;
  private config: AztecClientConfig;
  private wallet: TestWallet | null = null;
  private adminAddress: AztecAddress | null = null;
  private oracleContract: MockPriceFeedContract | null = null;
  private initialized: boolean = false;

  constructor(config: AztecClientConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Initialize the Aztec client - connects to node and sets up wallet
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('Aztec client already initialized');
      return;
    }

    this.logger.info({ nodeUrl: this.config.nodeUrl }, 'Initializing Aztec client');

    try {
      // Create node client
      const node = createAztecNodeClient(this.config.nodeUrl);

      // Create wallet and admin account (same as deploy script)
      this.wallet = await TestWallet.create(node);
      const [adminAccount] = await getInitialTestAccountsData();
      if (!adminAccount) {
        throw new Error('No admin account found in initial test accounts data');
      }

      await this.wallet.createSchnorrAccount(adminAccount.secret, adminAccount.salt);
      const accounts = await this.wallet.getAccounts();
      this.adminAddress = accounts[0]!.item;

      this.logger.info(
        { adminAddress: this.adminAddress.toString() },
        'Admin account initialized'
      );

      // Register and initialize oracle contract
      await this.initializeOracleContract();

      this.initialized = true;
      this.logger.info('Aztec client initialized successfully');
    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize Aztec client');
      throw error;
    }
  }

  /**
   * Register and initialize the oracle contract from deployments
   */
  private async initializeOracleContract(): Promise<void> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }

    const oracleInstance = ContractInstanceWithAddressSchema.parse(
      JSON.parse(deployments.priceOracle.instance)
    );
    const oracleAddress = AztecAddress.fromString(deployments.priceOracle.address);

    // Check if already registered
    const addressBook = await this.wallet.getAddressBook();
    if (!addressBook.find(({ item }) => item.equals(oracleAddress))) {
      await this.wallet.registerContract(oracleInstance, MockPriceFeedContractArtifact);
      this.logger.info({ address: oracleAddress.toString() }, 'Oracle contract registered');
    }

    this.oracleContract = await MockPriceFeedContract.at(oracleAddress, this.wallet);
    this.logger.info({ address: oracleAddress.toString() }, 'Oracle contract initialized');
  }

  /**
   * Get the oracle contract instance
   */
  getOracleContract(): MockPriceFeedContract {
    if (!this.oracleContract) {
      throw new Error('Oracle contract not initialized - call initialize() first');
    }
    return this.oracleContract;
  }

  /**
   * Get the admin address
   */
  getAdminAddress(): AztecAddress {
    if (!this.adminAddress) {
      throw new Error('Admin address not initialized - call initialize() first');
    }
    return this.adminAddress;
  }

  /**
   * Get the wallet instance
   */
  getWallet(): TestWallet {
    if (!this.wallet) {
      throw new Error('Wallet not initialized - call initialize() first');
    }
    return this.wallet;
  }

  /**
   * Check if client is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get token address from deployments by symbol
   */
  getTokenAddress(symbol: string): AztecAddress | undefined {
    const symbolLower = symbol.toLowerCase();
    if (symbolLower === 'usdc') {
      return AztecAddress.fromString(deployments.usdc.address);
    } else if (symbolLower === 'zec' || symbolLower === 'zcash') {
      return AztecAddress.fromString(deployments.zcash.address);
    } else if (symbolLower === 'zusd') {
      return AztecAddress.fromString(deployments.zusd.address);
    }
    return undefined;
  }
}
