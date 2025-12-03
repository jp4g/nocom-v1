import type { BaseWallet } from "@aztec/aztec.js/wallet";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import type { SendInteractionOptions, WaitOpts } from "@aztec/aztec.js/contracts";
import {
    TokenContract,
    MockPriceFeedContract,
    NocomLendingPoolV1Contract,
    NocomEscrowV1Contract,
    NocomEscrowV1ContractArtifact,
    NocomStablePoolV1Contract,
    NocomStableEscrowV1Contract,
    NocomStableEscrowV1ContractArtifact
} from "../artifacts";
import { Fr } from "@aztec/foundation/fields";
import { deriveKeys } from "@aztec/stdlib/keys";
import { registerEscrowWithPool } from "./escrow";
import { registerStableEscrowWithPool } from "./stableEscrow";

/**
 * Deploys a new instance of the AIP-20 aztec-standards Token Contract
 * @param wallet - the wallet managing the account deploying the contract
 * @param from - the address of the deployer/ minter
 * @param tokenMetadata - the name, symbol, and decimals of the token
 * @param minter - optional minter address, defaults to deployer
 * @param opts - Aztec tx send and wait options (optional)
 * @returns - the deployed Token Contract
 */
export async function deployTokenContract(
    wallet: BaseWallet,
    from: AztecAddress,
    tokenMetadata: { name: string; symbol: string; decimals: number },
    minter: AztecAddress = from,
    opts: { send: SendInteractionOptions, wait?: WaitOpts } = { send: { from }} 
): Promise<TokenContract> {
    return await TokenContract.deployWithOpts(
        { wallet, method: "constructor_with_minter" },
        tokenMetadata.name,
        tokenMetadata.symbol,
        tokenMetadata.decimals,
        minter,
        AztecAddress.ZERO,
    )
        .send(opts.send)
        .deployed(opts.wait);
}

/**
 * Deploys a new instance of the Mock Price Oracle Contract
 * @param wallet - the wallet managing the account deploying the contract
 * @param from - the address of the deployer
 * @param admin - optional admin address, defaults to deployer
 * @param opts - Aztec tx send and wait options (optional)
 * @returns - the deployed Mock Price Feed Contract
 */
export async function deployPriceOracleContract(
    wallet: BaseWallet,
    from: AztecAddress,
    admin: AztecAddress = from,
    opts: { send: SendInteractionOptions, wait?: WaitOpts } = { send: { from }}
): Promise<MockPriceFeedContract> {
    return await MockPriceFeedContract.deploy(wallet, admin)
        .send(opts.send)
        .deployed(opts.wait);
}

/**
 * Deploys a new instance of the Nocom Lending Pool V1 Contract
 * 
 * @param wallet - the wallet managing the account deploying the contract
 * @param from - the address of the deployer
 * @param admin - optional admin address, defaults to deployer
 * @param liquidatorPubkey - the schnorr public key of the liquidator (NOT USED RIGHT NOW)
 * @param priceOracleAddress - the address of the price oracle contract
 * @param treasuryAddress - the address of the treasury
 * @param collateralTokenAddress - the address of the collateral token
 * @param debtTokenAddress - the address of the debt token
 * @param maxLTV - the maximum loan-to-value ratio
 * @param liquidationThreshold - the liquidation threshold
 * @param opts - Aztec tx send and wait options (optional)
 * @returns the deployed Nocom Lending Pool V1 Contract
 */
export async function deployIsolatedPoolContract(
    wallet: BaseWallet,
    from: AztecAddress,
    admin: AztecAddress = from,
    liquidatorPubkey: { x: bigint, y: bigint },
    priceOracleAddress: AztecAddress,
    treasuryAddress: AztecAddress,
    collateralTokenAddress: AztecAddress,
    debtTokenAddress: AztecAddress,
    maxLTV: bigint,
    liquidationThreshold: bigint,
    opts: { send: SendInteractionOptions, wait?: WaitOpts } = { send: { from }}
): Promise<NocomLendingPoolV1Contract> {
    return await NocomLendingPoolV1Contract.deploy(
        wallet,
        admin,
        liquidatorPubkey.x,
        liquidatorPubkey.y,
        priceOracleAddress,
        treasuryAddress,
        collateralTokenAddress,
        debtTokenAddress,
        maxLTV,
        liquidationThreshold
    )
        .send(opts.send)
        .deployed(opts.wait);
}

/**
 * Deploys a new instance of the Nocom Escrow V1 Contract with a chosen secret key
 * 
 * @param wallet - the wallet managing the account deploying the contract
 * @param from - the address of the deployer
 * @param lendingPoolAddress - the address of the lending pool
 * @param collateralTokenAddress - the address of the collateral token
 * @param loanedTokenAddress - the address of the loaned token
 * @param register - whether to register the escrow with the lending pool immediately - defaults to true
 * @param opts - Aztec tx send and wait options (optional)
 * @returns
 *      - contract: the deployed Nocom Escrow V1 Contract
 *      - secretKey: the secret key used to decrypt the escrow contract's notes
 */
export async function deployEscrowContract(
    wallet: BaseWallet,
    from: AztecAddress,
    lendingPoolAddress: AztecAddress,
    collateralTokenAddress: AztecAddress,
    loanedTokenAddress: AztecAddress,
    register: boolean = true,
    opts: { send: SendInteractionOptions, wait?: WaitOpts } = { send: { from }}
): Promise<{ contract: NocomEscrowV1Contract, secretKey: Fr }> {
    // get keys for escrow contract
    let secretKey = Fr.random();
    let publicKeys = await deriveKeys(secretKey).then(keys => keys.publicKeys)
    // set up the deployment tx
    const deployment = NocomEscrowV1Contract.deployWithPublicKeys(
        publicKeys,
        wallet,
        lendingPoolAddress,
        collateralTokenAddress,
        loanedTokenAddress
    );
    // add contract decryption keys to wallet (rip PXE 🥀)
    const instance = await deployment.getInstance();
    await wallet.registerContract(instance, NocomEscrowV1ContractArtifact, secretKey)

    // deploy contract
    const contract = await deployment
        .send(opts.send)
        .deployed(opts.wait);
    
    // if specified, register the escrow with the lending pool
    // THIS WILL REQUIRE CREATE2 STYLE DEPLOYMENTS ONCE LIQUDIATOR APPROVAL IS REQUIRED
    if (register) await registerEscrowWithPool(from, contract, undefined, opts);

    return { contract, secretKey };
}

export async function deployStablePoolContract(
    wallet: BaseWallet,
    from: AztecAddress,
    admin: AztecAddress = from,
    liquidatorPubkey: { x: bigint, y: bigint },
    priceOracleAddress: AztecAddress,
    treasuryAddress: AztecAddress,
    collateralTokenAddress: AztecAddress,
    stableTokenAddress: AztecAddress,
    maxLTV: bigint,
    liquidationThreshold: bigint,
    opts: { send: SendInteractionOptions, wait?: WaitOpts } = { send: { from }}
): Promise<NocomStablePoolV1Contract> {
    return await NocomStablePoolV1Contract.deploy(
        wallet,
        admin,
        liquidatorPubkey.x,
        liquidatorPubkey.y,
        priceOracleAddress,
        treasuryAddress,
        collateralTokenAddress,
        stableTokenAddress,
        maxLTV,
        liquidationThreshold
    )
        .send(opts.send)
        .deployed(opts.wait);
}

export async function deployStableEscrowContract(
    wallet: BaseWallet,
    from: AztecAddress,
    lendingPoolAddress: AztecAddress,
    collateralTokenAddress: AztecAddress,
    stableTokenAddress: AztecAddress,
    register: boolean = true,
    opts: { send: SendInteractionOptions, wait?: WaitOpts } = { send: { from }}
): Promise<{ contract: NocomStableEscrowV1Contract, secretKey: Fr }> {
    // get keys for escrow contract
    let secretKey = Fr.random();
    let publicKeys = await deriveKeys(secretKey).then(keys => keys.publicKeys)
    // set up the deployment tx
    const deployment = NocomStableEscrowV1Contract.deployWithPublicKeys(
        publicKeys,
        wallet,
        lendingPoolAddress,
        collateralTokenAddress,
        stableTokenAddress
    );
    // add contract decryption keys to wallet (rip PXE 🥀)
    const instance = await deployment.getInstance();
    await wallet.registerContract(instance, NocomStableEscrowV1ContractArtifact, secretKey)
    // deploy contract
    const contract = await deployment
        .send(opts.send)
        .deployed(opts.wait);
    
    // if specified, register the escrow with the lending pool
    // THIS WILL REQUIRE CREATE2 STYLE DEPLOYMENTS ONCE LIQUDIATOR APPROVAL IS REQUIRED
    if (register) await registerStableEscrowWithPool(from, contract, undefined, opts);

    return { contract, secretKey };
}