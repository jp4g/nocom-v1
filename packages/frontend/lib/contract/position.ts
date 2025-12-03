import { AztecAddress } from '@aztec/aztec.js/addresses';
import { MarketUtilization } from '../types';
import { BaseWallet } from '@aztec/aztec.js/wallet';
import { NocomEscrowV1Contract, NocomLendingPoolV1Contract, NocomStablePoolV1Contract } from '@nocom-v1/contracts/artifacts';
import { BatchCall } from '@aztec/aztec.js/contracts';
import { DebtPosition, LoanPosition } from '@nocom-v1/contracts/types';
import { simulationQueue } from '../utils/simulationQueue';
import { calculateInterest } from '../../../contracts/ts/src/utils/math';
import { BORROW_INTEREST, EPOCH_LENGTH } from '@nocom-v1/contracts/constants';

/**
 * Returns the debt and collateral data
 * Uses a queue to prevent concurrent IndexedDB access which causes TransactionInactiveError
 */
export async function batchSimulateDebtPosition(
    markets: NocomLendingPoolV1Contract[],
    escrowsAddresses: AztecAddress[],
    wallet: BaseWallet,
    from: AztecAddress,
    currentEpoch: bigint
): Promise<Map<AztecAddress, DebtPosition>> {
    // Batch simulate utlilization calls
    if (markets.length > 4) // need to find practical tradeoff limit here
        throw new Error('Can only fetch debt position for up to 4 markets at a time');
    if (markets.length !== escrowsAddresses.length)
        throw new Error('Markets and escrow addresses length mismatch');

    // get the escrow rq
    console.log("PLSSSSSSS")
    // Queue the simulation to prevent concurrent IndexedDB access
    const batchResult = await simulationQueue.enqueue(async () => {
        console.log('[batchSimulateDebtPosition] Starting simulation for', markets.length, 'markets');
        const calls = [];
        for (let i = 0; i < markets.length; i++) {
            calls.push(markets[i].methods.get_collateral_and_debt(escrowsAddresses[i]));
        }
        const result = await new BatchCall(wallet, calls).simulate({ from });
        console.log('[batchSimulateDebtPosition] Simulation completed');
        return result;
    });

    // calculate interest for each position
    const positions: DebtPosition[] = [];
    for (const result of batchResult) {
        const [collateralNote, debtNote] = result;
        const collateral = collateralNote.amount;
        const principal = debtNote.amount;
        const startingEpoch = debtNote.epoch;
        const interest = calculateInterest(
            principal,
            startingEpoch,
            currentEpoch,
            BigInt(EPOCH_LENGTH),
            BORROW_INTEREST
        );
        positions.push({ collateral, interest, principal, startingEpoch });
    }
   
        
    // Build result map
    const result = new Map<AztecAddress, DebtPosition>();
    for (let i = 0; i < markets.length; i++) {
        const position = positions[i];

        console.log('[batchSimulateDebtPosition] Market data:', {
            poolAddress: markets[i].address,
            ...position
        });

        result.set(markets[i].address, position);
    }
    return result;
}


/**
 * Returns the loan supply data
 * Uses a queue to prevent concurrent IndexedDB access which causes TransactionInactiveError
 */
export async function batchSimulateLoanPosition(
    markets: NocomLendingPoolV1Contract[],
    wallet: BaseWallet,
    from: AztecAddress,
    currentEpoch: bigint
): Promise<Map<AztecAddress, LoanPosition>> {
    // Batch simulate utlilization calls
    if (markets.length > 4) // need to find practical tradeoff limit here
        throw new Error('Can only fetch loan position for up to 4 markets at a time');

    // Queue the simulation to prevent concurrent IndexedDB access
    const batchResult = await simulationQueue.enqueue(async () => {
        console.log('[batchSimulateLoanPosition] Starting simulation for', markets.length, 'markets');
        const calls = [];
        for (let i = 0; i < markets.length; i++) {
            calls.push(markets[i].methods.get_loan(from));
        }
        const result = await new BatchCall(wallet, calls).simulate({ from });
        console.log('[batchSimulateLoanPosition] Simulation completed');
        return result;
    });

    // calculate interest for each position
    const positions: DebtPosition[] = [];
    for (const loanNote of batchResult) {
        const collateral = loanNote.amount;
        const principal = loanNote.amount;
        const startingEpoch = loanNote.epoch;
        const interest = calculateInterest(
            principal,
            startingEpoch,
            currentEpoch,
            BigInt(EPOCH_LENGTH),
            BORROW_INTEREST
        );
        positions.push({ collateral, interest, principal, startingEpoch });
    }
   
        
    // Build result map
    const result = new Map<AztecAddress, LoanPosition>();
    for (let i = 0; i < markets.length; i++) {
        const position = positions[i];

        console.log('[batchSimulateLoanPosition] Market data:', {
            poolAddress: markets[i].address,
            ...position
        });

        result.set(markets[i].address, position);
    }
    return result;
}

