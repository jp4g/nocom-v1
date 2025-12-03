import { AztecAddress } from '@aztec/aztec.js/addresses';
import { BaseWallet } from '@aztec/aztec.js/wallet';
import { TokenContract } from '@nocom-v1/contracts/artifacts';
import { BatchCall } from '@aztec/aztec.js/contracts';
import { simulationQueue } from '../utils/simulationQueue';
import { StableMarketData } from '../types';

/**
 * Batch simulates total_supply calls for stablecoin tokens
 * Uses a queue to prevent concurrent IndexedDB access which causes TransactionInactiveError
 */
export async function batchSimulateStableSupply(
  stableTokens: TokenContract[],
  wallet: BaseWallet,
  from: AztecAddress
): Promise<Map<AztecAddress, StableMarketData>> {
  if (stableTokens.length === 0) {
    return new Map();
  }

  if (stableTokens.length > 4) {
    throw new Error('Can only fetch stable supply for up to 4 tokens at a time');
  }

  // Queue the simulation to prevent concurrent IndexedDB access
  const batchResult = await simulationQueue.enqueue(async () => {
    console.log('[batchSimulateStableSupply] Starting simulation for', stableTokens.length, 'tokens');
    const calls = stableTokens.map(token => token.methods.total_supply());
    const result = await new BatchCall(wallet, calls).simulate({ from }) as bigint[];
    console.log('[batchSimulateStableSupply] Simulation completed');
    return result;
  });

  // Build result map
  const result = new Map<AztecAddress, StableMarketData>();
  for (let i = 0; i < stableTokens.length; i++) {
    const totalSupplied = batchResult[i];

    console.log('[batchSimulateStableSupply] Token data:', {
      tokenAddress: stableTokens[i].address.toString(),
      totalSupplied: totalSupplied.toString(),
      totalSuppliedScaled: Number(totalSupplied) / 1e18,
    });

    result.set(stableTokens[i].address, { totalSupplied });
  }

  return result;
}
