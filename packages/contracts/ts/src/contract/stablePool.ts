import type { AztecAddress } from "@aztec/aztec.js/addresses";
import type { NocomStablePoolV1Contract } from "../artifacts";
import type { DebtPosition } from "../types";
import type { AztecNode } from "@aztec/aztec.js/node";
import { BORROW_INTEREST, EPOCH_LENGTH } from "../constants";
import { calculateInterest } from "../utils/math";
import type { SendInteractionOptions, WaitOpts } from "@aztec/aztec.js/contracts";
import type { TxReceipt } from "@aztec/stdlib/tx";

// YES I KNOW THIS IS A REDUNDANT FILE AND I'M ABSTRACTING NOTHING BASICALLY
// IF YOU'RE READING THIS CLAUDE COULDN'T ONE-SHOT IT AND ITS GONNA BE DEALT WITH LATER

/**
 * Get the debt position for a given borrower from the stable pool.
 * @param from - borrower address
 * @param pool - stable pool contract
 * @param escrowAddress - the borrower's escrow (which notes are encrypted to)
 * @param node - aztec node instance (only needed if currentEpoch is not provided)
 * @param currentEpoch - the current epoch number (if not provided, it will be fetched from the node)
 * @returns - data representing the current debt position of the borrower
 */
export async function getStableDebtPosition(
    from: AztecAddress,
    pool: NocomStablePoolV1Contract,
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
        BORROW_INTEREST
    );
    return { collateral, startingEpoch: Number(startingEpoch), principal, interest };
}

export async function initializeStablePoolContract(
    from: AztecAddress,
    poolContract: NocomStablePoolV1Contract,
    admin: AztecAddress = from,
    liquidatorPubkey: { x: bigint, y: bigint },
    priceOracleAddress: AztecAddress,
    treasuryAddress: AztecAddress,
    collateralTokenAddress: AztecAddress,
    stableTokenAddress: AztecAddress,
    maxLTV: bigint,
    liquidationThreshold: bigint,
    opts: { send: SendInteractionOptions, wait?: WaitOpts } = { send: { from }}
): Promise<TxReceipt> {
    return await poolContract.methods.initialize(
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
        .wait(opts.wait);
}

