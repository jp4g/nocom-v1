import type { BaseWallet } from "@aztec/aztec.js/wallet";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import type { TxReceipt } from "@aztec/stdlib/tx";
import type { NocomEscrowV1Contract, TokenContract } from "../artifacts";
import type { SendInteractionOptions, WaitOpts } from "@aztec/aztec.js/contracts";
import { privateToPublicTransferAuthwit } from "./token";

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

export async function depositCollateral(
    wallet: BaseWallet,
    from: AztecAddress,
    escrowContract: NocomEscrowV1Contract,
    poolAddress: AztecAddress,
    tokenContract: TokenContract,
    amount: bigint
): Promise<TxReceipt> {
    // 1. create authwit
    const { authwit, nonce } = await privateToPublicTransferAuthwit(
        wallet,
        from,
        tokenContract,
        poolAddress,
        poolAddress,
        amount,
    );
    const opts = { send: { from, authWitnesses: [authwit] } };

    // 2. call depositCollateral method
    return await escrowContract.methods.supply_collateral(amount, nonce)
        .send(opts.send)
        .wait();
}

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
    // 1. create authwit
    const { authwit, nonce } = await privateToPublicTransferAuthwit(
        wallet,
        from,
        collateralTokenContract,
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