import { AztecAddress } from '@aztec/aztec.js/addresses';
import {
    getContractInstanceFromInstantiationParams,
    type ContractInstanceWithAddress,
    type InteractionFeeOptions,
    type SendInteractionOptions
} from "@aztec/aztec.js/contracts";
import { L1FeeJuicePortalManager, type L2AmountClaim } from "@aztec/aztec.js/ethereum";
import { SponsoredFeePaymentMethod } from '@aztec/aztec.js/fee';
import { Fr } from '@aztec/aztec.js/fields';
import type { AztecNode } from '@aztec/aztec.js/node';
import { AccountManager, BaseWallet } from '@aztec/aztec.js/wallet';
import { createEthereumChain, createExtendedL1Client } from '@aztec/ethereum';
import { createLogger } from '@aztec/foundation/log';
import { SponsoredFPCContract, SponsoredFPCContractArtifact } from '@aztec/noir-contracts.js/SponsoredFPC';
import { GasSettings } from '@aztec/stdlib/gas';
import { deriveStorageSlotInMap } from '@aztec/stdlib/hash';
import type { TestWallet } from '@aztec/test-wallet/server';
import { precision } from './utils';
import { SPONSORED_FPC_SALT } from '@aztec/constants';

export async function getSponsoredFPCInstance(): Promise<ContractInstanceWithAddress> {
    return await getContractInstanceFromInstantiationParams(SponsoredFPCContract.artifact, {
        salt: new Fr(SPONSORED_FPC_SALT),
    });
}

/**
 * Ensures that the SponsoredFPC contract is deployed and registered in the wallet.
 * @notice used for sandbox environment since testnet has fpc deployed already
 * @notice derived from https://github.com/wakeuplabs-io/private-markets/blob/feat/migrate-to-v3.0.0/packages/avm/scripts/lib/aztec-setup.ts#L195
 * @param wallet - wallet to register the contract in
 * @param from - address to deploy fpc contract from
 * @param node - aztec node to check for deployment
 */
export async function ensureSponsoredFPCDeployed(
    wallet: BaseWallet,
    from: AztecAddress,
    node: AztecNode,
): Promise<void> {
    const sponsoredFPCInstance = await getSponsoredFPCInstance();
    const sponsoredFPCAddress = sponsoredFPCInstance.address;
    const instance = await node.getContract(sponsoredFPCAddress);
    // Check if already deployed
    try {
        if (!instance) {
            await SponsoredFPCContract.deploy(wallet).send({
                from,
                contractAddressSalt: new Fr(SPONSORED_FPC_SALT),
                universalDeploy: true,
            }).wait();
        }
    } catch (error) {
        throw new Error(`Failed to deploy SponsoredFPC: ${error}`);
    }
    await wallet.registerContract(sponsoredFPCInstance, SponsoredFPCContract.artifact);
    console.log('SponsoredFPC registered in wallet');
}

export async function getSponsoredPaymentMethod(wallet: BaseWallet) {
    const instance = await getSponsoredFPCInstance();
    await wallet.registerContract(instance, SponsoredFPCContractArtifact);
    return new SponsoredFeePaymentMethod(instance.address)
}

async function registerDeployedSponsoredFPCInWalletAndGetAddress(wallet: BaseWallet) {
    const fpc = await getSponsoredFPCInstance();
    // The following is no-op if the contract is already registered
    await wallet.registerContract(fpc, SponsoredFPCContract.artifact);
    return fpc.address;
}

export async function getFeeJuicePortalManager(
    node: AztecNode,
    l1RpcUrls: string[] = ["http://localhost:8545"],
    mnemonic: string = "test test test test test test test test test test test junk"
): Promise<L1FeeJuicePortalManager> {
    const { l1ChainId } = await node.getNodeInfo();
    const chain = createEthereumChain(l1RpcUrls, l1ChainId);
    const l1Client = createExtendedL1Client(
        chain.rpcUrls,
        mnemonic,
        chain.chainInfo
    );
    return await L1FeeJuicePortalManager.new(
        node,
        l1Client,
        createLogger("no")
    );
}

export async function getFeeJuicePublicBalance(
    node: AztecNode,
    from: AztecAddress,
): Promise<bigint> {
    const { feeJuice } = await node.getProtocolContractAddresses();
    const slot = await deriveStorageSlotInMap(new Fr(1), from);
    return await node.getPublicStorageAt("latest", feeJuice, slot).then(res => res.toBigInt());
}

/**
 * Get fee options for high gas environment
 * @param feePadding - padding base fee gas (no clue what this does tbh)
 * @param feeMultiplier - multiplier for the base fee
 */
export async function getPriorityFeeOptions(
    node: AztecNode,
    feeMultiplier: bigint
): Promise<InteractionFeeOptions> {
    const maxFeesPerGas = await node.getCurrentBaseFees()
        .then(res => res.mul(feeMultiplier));
    return { gasSettings: GasSettings.default({ maxFeesPerGas }) };
}

/**
 * Sets up an account with a claim
 * 
 * @param pxe PXE instance
 * @param feeJuicePortalManager L1FeeJuicePortalManager instance
 * @returns
 *      - account: the account that was created
 *      - claim: the claim to make once enough blocks have passed
 */
export const setupAccountWithFeeClaim = async (
    wallet: TestWallet,
    feeJuicePortalManager: L1FeeJuicePortalManager,
    amount: bigint = precision(1000n)
): Promise<{
    manager: AccountManager,
    key: { secretKey: Fr, salt: Fr }
    claim: L2AmountClaim,
}> => {
    const masterKey = Fr.random();
    const salt = Fr.random();
    const account = await wallet.createSchnorrAccount(masterKey, salt);

    const claim = await feeJuicePortalManager.bridgeTokensPublic(
        account.address,
        amount,
        true
    );
    return {
        manager: account,
        key: { secretKey: masterKey, salt },
        claim
    };
}