import type { Logger } from 'pino';
import type { EscrowType } from '@liquidator/shared';
import { createAztecNodeClient } from '@aztec/aztec.js/node';
import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import { TestWallet } from '@aztec/test-wallet/server';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import { ContractInstanceWithAddressSchema } from '@aztec/stdlib/contract';
import {
  NocomEscrowV1Contract,
  NocomEscrowV1ContractArtifact,
  NocomStableEscrowV1Contract,
  NocomStableEscrowV1ContractArtifact,
  NocomLendingPoolV1Contract,
  NocomLendingPoolV1ContractArtifact,
  NocomStablePoolV1Contract,
  NocomStablePoolV1ContractArtifact,
  TokenContract,
  TokenContractArtifact,
} from '@nocom-v1/contracts/artifacts';
import deployments from '../../../deployments.json' with { type: 'json' };

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

export interface RegisteredEscrow {
  address: AztecAddress;
  type: EscrowType;
  contract: NocomEscrowV1Contract | NocomStableEscrowV1Contract;
}

export interface PositionData {
  collateralAmount: bigint;
  debtAmount: bigint;
  debtEpoch: bigint;
}

/**
 * Unified Aztec client for the Liquidation Sentinel
 * Handles both monitoring (position syncing) and execution (liquidations)
 */
export class AztecClient {
  private logger: Logger;
  private config: AztecClientConfig;
  private wallet: TestWallet | null = null;
  private adminAddress: AztecAddress | null = null;
  private initialized: boolean = false;

  // Pool contract mappings
  private debtPools: Map<string, NocomLendingPoolV1Contract> = new Map();
  private stablePools: Map<string, NocomStablePoolV1Contract> = new Map();

  // Token contract mappings (for liquidation authwits)
  private tokenContracts: Map<string, TokenContract> = new Map();

  // Token address <-> symbol mappings
  private tokenAddressToSymbol: Map<string, string> = new Map();
  private tokenSymbolToAddress: Map<string, string> = new Map();

  // Escrow contract arrays
  private lendingEscrows: NocomEscrowV1Contract[] = [];
  private stableEscrows: NocomStableEscrowV1Contract[] = [];

  // Quick lookup for registered escrows
  private registeredEscrows: Map<string, RegisteredEscrow> = new Map();

  constructor(config: AztecClientConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Initialize the Aztec client - connects to node, sets up wallet, registers pools and tokens
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

      // Create wallet and admin account
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

      // Register pool contracts
      await this.initializePoolContracts();

      // Register token contracts (for liquidation authwits)
      await this.initializeTokenContracts();

      this.initialized = true;
      this.logger.info('Aztec client initialized successfully');
    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize Aztec client');
      throw error;
    }
  }

  /**
   * Register the pool contracts from deployments
   */
  private async initializePoolContracts(): Promise<void> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }

    // Register USDC debt pool
    const usdcDebtPool = await this.registerLendingPool(
      deployments.usdcDebtPool.address,
      deployments.usdcDebtPool.instance,
      'usdcDebtPool'
    );
    this.debtPools.set(usdcDebtPool.address.toString(), usdcDebtPool);

    // Register ZEC debt pool
    const zecDebtPool = await this.registerLendingPool(
      deployments.zecDebtPool.address,
      deployments.zecDebtPool.instance,
      'zecDebtPool'
    );
    this.debtPools.set(zecDebtPool.address.toString(), zecDebtPool);

    // Register stable pool
    const stablePool = await this.registerStablePool(
      deployments.stablePool.address,
      deployments.stablePool.instance,
      'stablePool'
    );
    this.stablePools.set(stablePool.address.toString(), stablePool);

    this.logger.info(
      {
        debtPools: Array.from(this.debtPools.keys()),
        stablePools: Array.from(this.stablePools.keys()),
      },
      'Pool contracts registered'
    );
  }

  /**
   * Register the token contracts from deployments
   */
  private async initializeTokenContracts(): Promise<void> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }

    // Register USDC token
    const usdcToken = await this.registerToken(
      deployments.usdc.address,
      deployments.usdc.instance,
      'USDC'
    );
    this.tokenContracts.set(usdcToken.address.toString(), usdcToken);
    this.tokenAddressToSymbol.set(deployments.usdc.address, 'USDC');
    this.tokenSymbolToAddress.set('USDC', deployments.usdc.address);

    // Register ZEC token
    const zecToken = await this.registerToken(
      deployments.zcash.address,
      deployments.zcash.instance,
      'ZEC'
    );
    this.tokenContracts.set(zecToken.address.toString(), zecToken);
    this.tokenAddressToSymbol.set(deployments.zcash.address, 'ZEC');
    this.tokenSymbolToAddress.set('ZEC', deployments.zcash.address);

    // Register zUSD token (stablecoin)
    const zusdToken = await this.registerToken(
      deployments.zusd.address,
      deployments.zusd.instance,
      'ZUSD'
    );
    this.tokenContracts.set(zusdToken.address.toString(), zusdToken);
    this.tokenAddressToSymbol.set(deployments.zusd.address, 'ZUSD');
    this.tokenSymbolToAddress.set('ZUSD', deployments.zusd.address);

    this.logger.info(
      { tokens: Array.from(this.tokenAddressToSymbol.entries()) },
      'Token contracts registered'
    );
  }

  /**
   * Register a token contract
   */
  private async registerToken(
    address: string,
    instanceJson: string,
    symbol: string
  ): Promise<TokenContract> {
    if (!this.wallet) throw new Error('Wallet not initialized');

    const instance = ContractInstanceWithAddressSchema.parse(JSON.parse(instanceJson));
    const tokenAddress = AztecAddress.fromString(address);

    await this.wallet.registerContract(instance, TokenContractArtifact);
    this.logger.info({ address, symbol }, 'Token contract registered');

    return TokenContract.at(tokenAddress, this.wallet);
  }

  /**
   * Register a lending pool contract
   */
  private async registerLendingPool(
    address: string,
    instanceJson: string,
    name: string
  ): Promise<NocomLendingPoolV1Contract> {
    if (!this.wallet) throw new Error('Wallet not initialized');

    const instance = ContractInstanceWithAddressSchema.parse(JSON.parse(instanceJson));
    const poolAddress = AztecAddress.fromString(address);

    await this.wallet.registerContract(instance, NocomLendingPoolV1ContractArtifact);
    this.logger.info({ address, name }, 'Lending pool registered');

    return NocomLendingPoolV1Contract.at(poolAddress, this.wallet);
  }

  /**
   * Register a stable pool contract
   */
  private async registerStablePool(
    address: string,
    instanceJson: string,
    name: string
  ): Promise<NocomStablePoolV1Contract> {
    if (!this.wallet) throw new Error('Wallet not initialized');

    const instance = ContractInstanceWithAddressSchema.parse(JSON.parse(instanceJson));
    const poolAddress = AztecAddress.fromString(address);

    await this.wallet.registerContract(instance, NocomStablePoolV1ContractArtifact);
    this.logger.info({ address, name }, 'Stable pool registered');

    return NocomStablePoolV1Contract.at(poolAddress, this.wallet);
  }

  /**
   * Register an escrow contract with instance and secret key
   */
  async registerEscrow(
    address: string,
    type: EscrowType,
    instanceJson: string,
    secretKey: string
  ): Promise<RegisteredEscrow> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized - call initialize() first');
    }

    // Check if already registered
    const existing = this.registeredEscrows.get(address);
    if (existing) {
      this.logger.debug({ address, type }, 'Escrow already registered');
      return existing;
    }

    this.logger.info({ address, type }, 'Registering escrow contract');

    const instance = ContractInstanceWithAddressSchema.parse(JSON.parse(instanceJson));
    const escrowAddress = AztecAddress.fromString(address);
    const secret = Fr.fromString(secretKey);

    let contract: NocomEscrowV1Contract | NocomStableEscrowV1Contract;

    if (type === 'lending') {
      await this.wallet.registerContract(instance, NocomEscrowV1ContractArtifact, secret);
      contract = await NocomEscrowV1Contract.at(escrowAddress, this.wallet);
      this.lendingEscrows.push(contract);
    } else {
      await this.wallet.registerContract(instance, NocomStableEscrowV1ContractArtifact, secret);
      contract = await NocomStableEscrowV1Contract.at(escrowAddress, this.wallet);
      this.stableEscrows.push(contract);
    }

    const registeredEscrow: RegisteredEscrow = {
      address: escrowAddress,
      type,
      contract,
    };

    this.registeredEscrows.set(address, registeredEscrow);
    this.logger.info({ address, type }, 'Escrow contract registered');

    return registeredEscrow;
  }

  /**
   * Sync private state for an escrow
   */
  async syncEscrowPrivateState(address: string): Promise<void> {
    const escrow = this.registeredEscrows.get(address);
    if (!escrow) {
      throw new Error(`Escrow not registered: ${address}`);
    }

    this.logger.debug({ address }, 'Syncing escrow private state');

    try {
      await escrow.contract.methods.sync_private_state().simulate();
      this.logger.debug({ address }, 'Escrow private state synced');
    } catch (error) {
      this.logger.error({ error, address }, 'Failed to sync escrow private state');
      throw error;
    }
  }

  /**
   * Get position data (collateral and debt) for an escrow from its pool
   */
  async getPositionData(escrowAddress: string, poolAddress: string, type: EscrowType): Promise<PositionData> {
    if (!this.adminAddress) {
      throw new Error('Admin address not initialized');
    }

    const escrowAztecAddress = AztecAddress.fromString(escrowAddress);

    this.logger.debug({ escrowAddress, poolAddress, type }, 'Fetching position data');

    try {
      let result: [{ amount: bigint }, { amount: bigint; epoch: bigint }];

      if (type === 'lending') {
        const pool = this.debtPools.get(poolAddress);
        if (!pool) {
          throw new Error(`Debt pool not found: ${poolAddress}`);
        }
        result = await pool.methods
          .get_collateral_and_debt(escrowAztecAddress)
          .simulate({ from: this.adminAddress });
      } else {
        const pool = this.stablePools.get(poolAddress);
        if (!pool) {
          throw new Error(`Stable pool not found: ${poolAddress}`);
        }
        result = await pool.methods
          .get_collateral_and_debt(escrowAztecAddress)
          .simulate({ from: this.adminAddress });
      }

      const [collateralNote, debtNote] = result;

      const positionData: PositionData = {
        collateralAmount: collateralNote.amount,
        debtAmount: debtNote.amount,
        debtEpoch: debtNote.epoch,
      };

      this.logger.debug({ escrowAddress, positionData }, 'Position data fetched');

      return positionData;
    } catch (error) {
      this.logger.error({ error, escrowAddress, poolAddress }, 'Failed to fetch position data');
      throw error;
    }
  }

  /**
   * Get a registered escrow by address
   */
  getRegisteredEscrow(address: string): RegisteredEscrow | undefined {
    return this.registeredEscrows.get(address);
  }

  /**
   * Get all registered escrows
   */
  getAllRegisteredEscrows(): RegisteredEscrow[] {
    return Array.from(this.registeredEscrows.values());
  }

  /**
   * Get debt pool by address
   */
  getDebtPool(address: string): NocomLendingPoolV1Contract | undefined {
    return this.debtPools.get(address);
  }

  /**
   * Get stable pool by address
   */
  getStablePool(address: string): NocomStablePoolV1Contract | undefined {
    return this.stablePools.get(address);
  }

  /**
   * Get token symbol from address
   */
  getTokenSymbol(address: string): string | undefined {
    return this.tokenAddressToSymbol.get(address);
  }

  /**
   * Get token address from symbol
   */
  getTokenAddress(symbol: string): string | undefined {
    return this.tokenSymbolToAddress.get(symbol.toUpperCase());
  }

  /**
   * Get token contract by address
   */
  getTokenContract(address: string): TokenContract | undefined {
    return this.tokenContracts.get(address);
  }

  /**
   * Get token contract by symbol (USDC, ZEC, ZUSD)
   */
  getTokenContractBySymbol(symbol: string): TokenContract | undefined {
    const address = this.tokenSymbolToAddress.get(symbol.toUpperCase());
    if (!address) return undefined;
    return this.tokenContracts.get(address);
  }

  /**
   * Get all debt pools
   */
  getAllDebtPools(): Map<string, NocomLendingPoolV1Contract> {
    return this.debtPools;
  }

  /**
   * Get all stable pools
   */
  getAllStablePools(): Map<string, NocomStablePoolV1Contract> {
    return this.stablePools;
  }

  /**
   * Get all lending escrows
   */
  getLendingEscrows(): NocomEscrowV1Contract[] {
    return this.lendingEscrows;
  }

  /**
   * Get all stable escrows
   */
  getStableEscrows(): NocomStableEscrowV1Contract[] {
    return this.stableEscrows;
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
   * Health check - verify connection to node
   */
  async healthCheck(): Promise<boolean> {
    if (!this.wallet) {
      return false;
    }

    try {
      await this.wallet.getAccounts();
      return true;
    } catch (error) {
      this.logger.error({ error }, 'Health check failed');
      return false;
    }
  }
}
