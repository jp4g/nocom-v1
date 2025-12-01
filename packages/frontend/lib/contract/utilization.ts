import { AztecAddress } from '@aztec/aztec.js/addresses';
import { MarketUtilization } from '../types';
import { BaseWallet } from '@aztec/aztec.js/wallet';
import { NocomLendingPoolV1Contract } from '@nocom-v1/contracts/artifacts';
import { BatchCall } from '@aztec/aztec.js/contracts';
import { UtilizationSimulationResult } from '@nocom-v1/contracts/types';

/**
 * Returns the utilization data
 */
export async function batchSimulateUtilization(
  markets: NocomLendingPoolV1Contract[],
  wallet: BaseWallet,
  from: AztecAddress
): Promise<Map<AztecAddress, MarketUtilization>> {
  // Batch simulate utlilization calls
  if (markets.length > 4) // need to find practical tradeoff limit here
    throw new Error('Can only fetch utilization for up to 4 markets at a time');
  const calls = markets.map(contract => contract.methods.get_utilization());
  const batchResult = await new BatchCall(wallet, calls)
    .simulate({ from }) as UtilizationSimulationResult[];

  // Build result map
  const result = new Map<AztecAddress, MarketUtilization>();
  for (let i = 0; i < markets.length; i++) {
    const simulationResult = batchResult[i];

    const utilization = {
      totalSupplied: simulationResult.total_supplied,
      totalBorrowed: simulationResult.total_borrowed,
    };
    result.set(markets[i].address, utilization);
  }
  return result;
}
