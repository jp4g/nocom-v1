import type { AztecAddress } from "@aztec/aztec.js/addresses";
import type { NocomStablePoolV1Contract } from "../artifacts";
import type { DebtPosition } from "../types";
import type { AztecNode } from "@aztec/aztec.js/node";
import { BORROW_INTEREST, EPOCH_LENGTH } from "../constants";
import { calculateInterest } from "../utils/math";

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

