import type { BaseWallet } from "@aztec/aztec.js/wallet";
import type { AztecAddress } from "@aztec/aztec.js/addresses";
import type { TxReceipt } from "@aztec/stdlib/tx";
import type { NocomLendingPoolV1Contract, TokenContract } from "../artifacts";
import { privateToPublicTransferAuthwit } from "./token";
import type { SendInteractionOptions, WaitOpts } from "@aztec/aztec.js/contracts";
import type { DebtPosition, LoanPosition } from "../types";
import type { AztecNode } from "@aztec/aztec.js/node";
import { EPOCH_LENGTH, LEND_INTEREST } from "../constants";
import { calculateInterest } from "../utils/math";

export async function supplyLiquidity(
    wallet: BaseWallet,
    from: AztecAddress,
    poolContract: NocomLendingPoolV1Contract,
    tokenContract: TokenContract,
    amount: bigint,
    opts: { send: SendInteractionOptions, wait?: WaitOpts } = { send: { from }}
): Promise<TxReceipt> {
    // 1. create authwit
    const { authwit, nonce } = await privateToPublicTransferAuthwit(
        wallet,
        from,
        tokenContract,
        poolContract.address,
        poolContract.address,
        amount,
    );
    opts.send.authWitnesses = [authwit];

    // 2. call supply method
    return await poolContract.methods.supply_private(from, amount, nonce)
        .send(opts.send)
        .wait(opts.wait);
}

export async function getPoolUtilization(
    from: AztecAddress,
    pool: NocomLendingPoolV1Contract
): Promise<{ supplied: bigint, borrowed: bigint }> {
    const utilization = await pool.methods.get_utilization().simulate({ from });
    return {
        supplied: utilization.total_supplied,
        borrowed: utilization.total_borrowed,
    }
}

/**
 * Get a loan position for a given lender from the lending pool.
 * 
 * @param from - lender address
 * @param pool - lending pool contract
 * @param node - aztec node instance (only needed if currentEpoch is not provided)
 * @param currentEpoch - the current epoch number (if not provided, it will be fetched from the node)
 * @returns - data representing the current loan position of the lender
 */
export async function getLoanPosition(
    from: AztecAddress,
    pool: NocomLendingPoolV1Contract,
    node?: AztecNode,
    currentEpoch?: bigint,
): Promise<LoanPosition> {
    // 1. get the loan note
    const loanNote = await pool.methods.get_loan(from).simulate({ from });
    const principal = loanNote.amount;
    const startingEpoch = loanNote.epoch;
    // 2. get current epoch if not provided
    if (!currentEpoch) {
        const timestamp = await node!.getBlock("latest").then(block => block!.timestamp);
        // unix timestamp in seconds won't overflow so cast to number for ceil div
        currentEpoch = BigInt(Math.ceil(Number(timestamp) / EPOCH_LENGTH))
    }
    // 3. calculate the accrued interest
    const interest = calculateInterest(
        principal,
        startingEpoch,
        currentEpoch,
        BigInt(EPOCH_LENGTH),
        LEND_INTEREST
    );

    return { startingEpoch: Number(startingEpoch), principal, interest }
}

/**
 * Get the debt position for a given borrower from the lending pool.
 * @param from - borrower address
 * @param pool - lending pool contract
 * @param escrowAddress - the borrower's escrow (which notes are encrypted to)
 * @param node - aztec node instance (only needed if currentEpoch is not provided)
 * @param currentEpoch - the current epoch number (if not provided, it will be fetched from the node)
 * @returns - data representing the current debt position of the borrower
 */
export async function getDebtPosition(
    from: AztecAddress,
    pool: NocomLendingPoolV1Contract,
    escrowAddress: AztecAddress,
    node?: AztecNode,
    currentEpoch?: bigint,
): Promise<DebtPosition> {
    // 1. get the collateral and debt notes
    const debtAndCollateral = await pool.methods
        .get_collateral_and_debt(escrowAddress)
        .simulate({ from });
    const collateralNote = debtAndCollateral[0];
    const debtNote = debtAndCollateral[1];
    const collateral = collateralNote.amount;
    const principal = debtNote.amount;
    const startingEpoch = debtNote.epoch;
    // 2. get current epoch if not provided
    if (!currentEpoch) {
        const timestamp = await node!.getBlock("latest").then(block => block!.timestamp);
        // unix timestamp in seconds won't overflow so cast to number for ceil div
        currentEpoch = BigInt(Math.ceil(Number(timestamp) / EPOCH_LENGTH))
    }
    // 3. calculate the accrued interest
    const interest = calculateInterest(
        principal,
        startingEpoch,
        currentEpoch,
        BigInt(EPOCH_LENGTH),
        LEND_INTEREST
    );
    return { collateral, startingEpoch: Number(startingEpoch), principal, interest };
}