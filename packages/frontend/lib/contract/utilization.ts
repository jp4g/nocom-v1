import { AztecAddress } from '@aztec/aztec.js/addresses';
import { MarketUtilization } from '../types';
import { BaseWallet } from '@aztec/aztec.js/wallet';
import { NocomLendingPoolV1Contract } from '@nocom-v1/contracts/artifacts';
import { BatchCall } from '@aztec/aztec.js/contracts';
import { UtilizationSimulationResult } from '@nocom-v1/contracts/types';
import { simulationQueue } from '../utils/simulationQueue';

/**
 * Returns the utilization data
 * Uses a queue to prevent concurrent IndexedDB access which causes TransactionInactiveError
 */
export async function batchSimulateUtilization(
  markets: NocomLendingPoolV1Contract[],
  wallet: BaseWallet,
  from: AztecAddress
): Promise<Map<AztecAddress, MarketUtilization>> {
  // Batch simulate utlilization calls
  if (markets.length > 4) // need to find practical tradeoff limit here
    throw new Error('Can only fetch utilization for up to 4 markets at a time');

  // Queue the simulation to prevent concurrent IndexedDB access
  const batchResult = await simulationQueue.enqueue(async () => {
    console.log('[batchSimulateUtilization] Starting simulation for', markets.length, 'markets');
    const calls = markets.map(contract => contract.methods.get_utilization());
    const result = await new BatchCall(wallet, calls)
      .simulate({ from }) as UtilizationSimulationResult[];
    console.log('[batchSimulateUtilization] Simulation completed');
    return result;
  });

  // Build result map
  const result = new Map<AztecAddress, MarketUtilization>();
  for (let i = 0; i < markets.length; i++) {
    const simulationResult = batchResult[i];

    const utilization = {
      totalSupplied: simulationResult.total_supplied,
      totalBorrowed: simulationResult.total_borrowed,
    };

    console.log('[batchSimulateUtilization] Market data:', {
      poolAddress: markets[i].address.toString(),
      totalSupplied: simulationResult.total_supplied.toString(),
      totalBorrowed: simulationResult.total_borrowed.toString(),
      totalSuppliedScaled: Number(simulationResult.total_supplied) / 1e18,
      totalBorrowedScaled: Number(simulationResult.total_borrowed) / 1e18,
    });

    result.set(markets[i].address, utilization);
  }
  return result;
}
