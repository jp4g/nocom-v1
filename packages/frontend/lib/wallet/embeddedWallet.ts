import { EcdsaKAccountContract, EcdsaRAccountContract } from '@aztec/accounts/ecdsa/lazy'
import { SchnorrAccountContract } from '@aztec/accounts/schnorr/lazy'
import { getInitialTestAccountsData } from '@aztec/accounts/testing/lazy'
import {
  type Account,
  type AccountContract,
  SignerlessAccount,
} from '@aztec/aztec.js/account'
import {
  AccountManager,
  BaseWallet,
  type Aliased,
} from '@aztec/aztec.js/wallet'
import {
  createAztecNodeClient,
  type AztecNode,
} from '@aztec/aztec.js/node'
import { getPXEConfig, type PXEConfig } from '@aztec/pxe/config';
import { createPXE, PXE } from '@aztec/pxe/client/lazy';
import { Fq, Fr } from '@aztec/foundation/fields'
import { AztecAddress } from '@aztec/stdlib/aztec-address'
import { deriveSigningKey } from '@aztec/stdlib/keys'
import { DefaultMultiCallEntrypoint } from '@aztec/entrypoints/multicall'
import { WalletDB, type AccountType } from './walletDB'
import { convertFromUTF8BufferAsString } from '../utils/conversion'
import { createStore } from '@aztec/kv-store/indexeddb'
import { createLogger } from '@aztec/foundation/log'
import { createStubAccount } from '@aztec/accounts/stub'
import { getStubAccountContractArtifact } from '@aztec/accounts/stub/lazy'
import { getContractInstanceFromInstantiationParams } from '@aztec/stdlib/contract'
import { ExecutionPayload, mergeExecutionPayloads } from '@aztec/entrypoints/payload'
import { SimulateInteractionOptions } from '@aztec/aztec.js/contracts'
import { TxSimulationResult } from '@aztec/stdlib/tx'
import { DefaultAccountEntrypoint, DefaultAccountEntrypointOptions } from '@aztec/entrypoints/account'
import { WebLogger } from '../utils/webLogger'

export interface AccountData {
  secret: Fr
  salt: Fr
  contract: AccountContract
}

export class EmbeddedWallet extends BaseWallet {
  private walletDB: WalletDB

  constructor(pxe: PXE, aztecNode: AztecNode, walletDB: WalletDB) {
    super(pxe, aztecNode)
    this.walletDB = walletDB
  }

  static async create(nodeURL: string) {
    const aztecNode = createAztecNodeClient(nodeURL);

    const l1Contracts = await aztecNode.getL1ContractAddresses();
    const rollupAddress = l1Contracts.rollupAddress;

    const config = getPXEConfig();
    config.dataDirectory = `pxe-${rollupAddress}`;
    config.proverEnabled = false;
    const configWithContracts = {
      ...config,
      l1Contracts,
    } as PXEConfig;

    const logger = WebLogger.getInstance();
    const pxe = await createPXE(aztecNode, configWithContracts, {
      loggers: {
        store: logger.createLogger('pxe:data:idb'),
        pxe: logger.createLogger('pxe:service'),
        prover: logger.createLogger('bb:wasm:lazy'),
      },
    });

    const walletLogger = logger.createLogger('wallet:data:idb');
    const walletDBStore = await createStore(
      `wallet-${rollupAddress}`,
      { dataDirectory: 'wallet', dataStoreMapSizeKb: 2e10 },
      walletLogger,
    );
    const db = WalletDB.init(walletDBStore, walletLogger.info);
    return new EmbeddedWallet(pxe, aztecNode, db);
  }

  protected async getAccountFromAddress(address: AztecAddress): Promise<Account> {
    let account: Account | undefined;
    if (address.equals(AztecAddress.ZERO)) {
      const chainInfo = await this.getChainInfo();
      account = new SignerlessAccount(chainInfo);
    } else {
      const { secretKey, salt, signingKey, type } = await this.walletDB.retrieveAccount(address);
      const parsedType = convertFromUTF8BufferAsString(type) as AccountType;
      const accountManager = await this.createAccountInternal(parsedType, secretKey, salt, signingKey);
      account = await accountManager.getAccount();
    }

    if (!account) {
      throw new Error(`Account not found in wallet for address: ${address}`);
    }

    return account;
  }

  private async createAccountInternal(
    type: AccountType,
    secret: Fr,
    salt: Fr,
    signingKey: Buffer,
  ): Promise<AccountManager> {
    let contract;
    switch (type) {
      case 'schnorr': {
        contract = new SchnorrAccountContract(Fq.fromBuffer(signingKey));
        break;
      }
      case 'ecdsasecp256k1': {
        contract = new EcdsaKAccountContract(signingKey);
        break;
      }
      case 'ecdsasecp256r1': {
        contract = new EcdsaRAccountContract(signingKey);
        break;
      }
      default: {
        throw new Error(`Unknown account type ${type}`);
      }
    }

    const accountManager = await AccountManager.create(this, secret, contract, salt);

    const instance = await accountManager.getInstance();
    const artifact = await accountManager.getAccountContract().getContractArtifact();

    await this.registerContract(instance, artifact, accountManager.getSecretKey());

    return accountManager;
  }


  async createAndStoreAccount(
    alias: string,
    type: AccountType,
    secret: Fr,
    salt: Fr,
    signingKey: Buffer,
  ): Promise<AccountManager> {
    const accountManager = await this.createAccountInternal(type, secret, salt, signingKey);
    await this.walletDB.storeAccount(accountManager.address, { type, secretKey: secret, salt, alias, signingKey });
    return accountManager;
  }

  async getAccounts() {
    const aliasedAccounts = await this.walletDB.listAccounts();
    const testAccountData = await getInitialTestAccountsData();
    const [sampleAccount] = testAccountData;
    let i = 0;
    // Assume we're in a network with test accounts (local network) if the first of them
    // is initialized
    if (
      !aliasedAccounts.find(aliased => aliased.item.equals(sampleAccount.address)) &&
      (await this.pxe.getContractMetadata(sampleAccount.address)).isContractInitialized
    ) {
      for (const accountData of testAccountData) {
        const accountManager = await this.createAccountInternal(
          'schnorr',
          accountData.secret,
          accountData.salt,
          accountData.signingKey.toBuffer(),
        );
        if (!aliasedAccounts.find(({ item }) => accountManager.address.equals(item))) {
          const instance = accountManager.getInstance();
          const account = await accountManager.getAccount();
          const alias = `test${i}`;
          await this.walletDB.storeAccount(instance.address, {
            type: 'schnorr',
            secretKey: account.getSecretKey(),
            alias,
            signingKey: deriveSigningKey(account.getSecretKey()),
            salt: instance.salt,
          });
          aliasedAccounts.push({
            alias: `accounts:${alias}`,
            item: instance.address,
          });
        }
        i++;
      }
    }
    return aliasedAccounts;
  }

  override async registerSender(address: AztecAddress, alias: string) {
    await this.walletDB.storeSender(address, alias);
    return this.pxe.registerSender(address);
  }

  override async getAddressBook(): Promise<Aliased<AztecAddress>[]> {
    const senders = await this.pxe.getSenders();
    const storedSenders = await this.walletDB.listSenders();
    for (const storedSender of storedSenders) {
      if (senders.findIndex((sender: any) => sender.equals(storedSender.item)) === -1) {
        await this.pxe.registerSender(storedSender.item);
      }
    }
    return storedSenders;
  }

  private async getFakeAccountDataFor(address: AztecAddress) {
    const chainInfo = await this.getChainInfo();
    const originalAccount = await this.getAccountFromAddress(address);
    const originalAddress = await originalAccount.getCompleteAddress();
    const { contractInstance } = await this.pxe.getContractMetadata(originalAddress.address);
    if (!contractInstance) {
      throw new Error(`No contract instance found for address: ${originalAddress.address}`);
    }
    const stubAccount = createStubAccount(originalAddress, chainInfo);
    const StubAccountContractArtifact = await getStubAccountContractArtifact();
    const instance = await getContractInstanceFromInstantiationParams(StubAccountContractArtifact, {
      salt: Fr.random(),
    });
    return {
      account: stubAccount,
      instance,
      artifact: StubAccountContractArtifact,
    };
  }
  
  override async simulateTx(
    executionPayload: ExecutionPayload,
    opts: SimulateInteractionOptions,
  ): Promise<TxSimulationResult> {
    const feeOptions = opts.fee?.estimateGas
      ? await this.getFeeOptionsForGasEstimation(opts.from, opts.fee)
      : await this.getDefaultFeeOptions(opts.from, opts.fee);
    const feeExecutionPayload = await feeOptions.walletFeePaymentMethod?.getExecutionPayload();
    const executionOptions: DefaultAccountEntrypointOptions = {
      txNonce: Fr.random(),
      cancellable: this.cancellableTransactions,
      feePaymentMethodOptions: feeOptions.accountFeePaymentMethodOptions,
    };
    const finalExecutionPayload = feeExecutionPayload
      ? mergeExecutionPayloads([feeExecutionPayload, executionPayload])
      : executionPayload;
    const { account: fromAccount, instance, artifact } = await this.getFakeAccountDataFor(opts.from);
    const txRequest = await fromAccount.createTxExecutionRequest(
      finalExecutionPayload,
      feeOptions.gasSettings,
      executionOptions,
    );
    const contractOverrides = {
      [opts.from.toString()]: { instance, artifact },
    };
    return this.pxe.simulateTx(txRequest, true /* simulatePublic */, true, true, {
      contracts: contractOverrides,
    });
  }
}
