import type { BaseWallet } from "@aztec/aztec.js/wallet";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import type { TxReceipt } from "@aztec/stdlib/tx";
import type { NocomEscrowV1Contract, TokenContract } from "../artifacts";
import type { SendInteractionOptions, WaitOpts } from "@aztec/aztec.js/contracts";
import { privateTransferAuthwit } from "./token";

/**
 * Register the escrow contract with the lending pool
 * @notice: signature is disaled, but this should be called after handshake with liquidator
 * 
 * @param from - caller addres
 * @param escrowContract - escrow contract to register
 * @param signature - signature by liquidator proving handshake
 * @param opts - send and wait options
 * @returns - receipt upon tx confirmation
 */
export async function registerEscrowWithPool(
    from: AztecAddress,
    escrowContract: NocomEscrowV1Contract,
    signature: number[] = new Array(64).fill(0),
    opts: { send: SendInteractionOptions, wait?: WaitOpts } = { send: { from } }
): Promise<TxReceipt> {
    return await escrowContract.methods.register(signature)
        .send(opts.send)
        .wait(opts.wait);
}

/**
 * Deposit collateral into the lending pool via the escrow contract to back a loan
 * 
 * @param wallet - wallet instance holding the `from` account
 * @param from - address depositing collateral
 * @param escrowContract - escrow contract managing debt position
 * @param poolAddress - the address of the lending pool
 * @param tokenContract - token contract of the collateral being deposited
 * @param amount - amount to deposit
 * @param opts - send and wait options
 * @returns - receipt upon tx confirmation
 */
export async function depositCollateral(
    wallet: BaseWallet,
    from: AztecAddress,
    escrowContract: NocomEscrowV1Contract,
    collateralTokenContract: TokenContract,
    amount: bigint,
    opts: { send: SendInteractionOptions, wait?: WaitOpts } = { send: { from } },
): Promise<TxReceipt> {
    // 1. create authwit to transfer collateral tokens to the escrow
    const { authwit, nonce } = await privateTransferAuthwit(
        wallet,
        from,
        collateralTokenContract,
        'transfer_private_to_private',
        escrowContract.address,
        escrowContract.address,
        amount,
    );
    opts = { send: { from, authWitnesses: [authwit] } };

    // 2. call depositCollateral method
    return await escrowContract.methods.supply_collateral(amount, nonce)
        .send(opts.send)
        .wait();
}

/**
 * Borrow funds from the lending pool via the escrow contract
 * 
 * 
 * @param from - address borrowing funds
 * @param escrowContract - escrow contract managing debt position
 * @param amount - amount to borrow
 * @param assertedCollateralTokenPrice - asserted price of the collateral token
 * @param assertedDebtTokenPrice - asserted price of the debt token
 * @param opts - send and wait options
 * @returns 
 */
export async function borrowFromPool(
    from: AztecAddress,
    escrowContract: NocomEscrowV1Contract,
    amount: bigint,
    assertedCollateralTokenPrice: bigint,
    assertedDebtTokenPrice: bigint,
    opts: { send: SendInteractionOptions, wait?: WaitOpts } = { send: { from } }
): Promise<TxReceipt> {
    return await escrowContract.methods.borrow(
        amount,
        assertedCollateralTokenPrice,
        assertedDebtTokenPrice
    )
        .send(opts.send)
        .wait(opts.wait);
}

/**
 * Repay a debt position via the escrow contract
 * 
 * @param wallet - wallet instance holding the `from` account
 * @param from - address repaying the debt
 * @param escrowContract - escrow contract managing debt position
 * @param debtTokenContract - token contract of the debt being repaid
 * @param poolAddress - the address of the lending pool
 * @param amount - amount to repay
 * @param opts - send and wait options
 * @returns - receipt upon tx confirmation
 */
export async function repayDebt(
    wallet: BaseWallet,
    from: AztecAddress,
    escrowContract: NocomEscrowV1Contract,
    debtTokenContract: TokenContract,
    poolAddress: AztecAddress,
    amount: bigint,
    opts: { send: SendInteractionOptions, wait?: WaitOpts } = { send: { from } }
): Promise<TxReceipt> {
    // 1. create authwit
    const { authwit, nonce } = await privateTransferAuthwit(
        wallet,
        from,
        debtTokenContract,
        'transfer_private_to_public',
        poolAddress,
        poolAddress,
        amount,
    );
    opts.send.authWitnesses = [authwit];

    // 2. call repayDebt method
    return await escrowContract.methods.repay(amount, nonce)
        .send(opts.send)
        .wait(opts.wait);
}

/**
 * Withdraw collateral from the lending pool via the escrow contract
 * 
 * @param from - address withdrawing collateral
 * @param escrowContract - escrow contract managing debt position
 * @param amount - amount to withdraw
 * @param assertedCollateralTokenPrice - asserted price of the collateral token
 * @param assertedDebtTokenPrice - asserted price of the debt token
 * @param opts - send and wait options
 * @returns - receipt upon tx confirmation
 */
export async function withdrawCollateral(
    from: AztecAddress,
    escrowContract: NocomEscrowV1Contract,
    amount: bigint,
    assertedCollateralTokenPrice: bigint,
    assertedDebtTokenPrice: bigint,
    opts: { send: SendInteractionOptions, wait?: WaitOpts } = { send: { from } }
): Promise<TxReceipt> {
    return await escrowContract.methods.withdraw_collateral(
        amount,
        assertedCollateralTokenPrice,
        assertedDebtTokenPrice
    )
        .send(opts.send)
        .wait(opts.wait);
}

/**
 * Liquidate a position via the escrow contract
 * 
 * @param wallet - wallet instance holding the `from` account
 * @param from - address performing the liquidation
 * @param escrowContract - escrow contract managing debt position
 * @param collateralTokenContract - token contract of the collateral being seized
 * @param poolAddress - the address of the lending pool
 * @param repayAmount - amount to repay on behalf of the borrower
 * @param assertedCollateralTokenPrice - asserted price of the collateral token
 * @param assertedDebtTokenPrice - asserted price of the debt token
 * @param opts - send and wait options
 * @returns - receipt upon tx confirmation
 */
export async function liquidatePosition(
    wallet: BaseWallet,
    from: AztecAddress,
    escrowContract: NocomEscrowV1Contract,
    collateralTokenContract: TokenContract,
    poolAddress: AztecAddress,
    repayAmount: bigint,
    assertedCollateralTokenPrice: bigint,
    assertedDebtTokenPrice: bigint,
    opts: { send: SendInteractionOptions, wait?: WaitOpts } = { send: { from } }
): Promise<TxReceipt> {
    // 1. create authwit to transfer repayAmount of collateral tokens to the pool
    const { authwit, nonce } = await privateTransferAuthwit(
        wallet,
        from,
        collateralTokenContract,
        'transfer_private_to_public',
        poolAddress,
        poolAddress,
        repayAmount,
    );
    opts.send.authWitnesses = [authwit];

    // 2. call liquidatePosition method
    return await escrowContract.methods.liquidate(
        repayAmount,
        nonce,
        assertedCollateralTokenPrice,
        assertedDebtTokenPrice,
    )
        .send(opts.send)
        .wait(opts.wait);
};