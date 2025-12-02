import { AztecAddress } from "@aztec/aztec.js/addresses";
import { BaseWallet } from "@aztec/aztec.js/wallet";
import { MockPriceFeedContract } from "@nocom-v1/contracts/artifacts";
import { BatchCall } from "@aztec/aztec.js/contracts";

/**
 * Fetch prices for tokens from the oracle contract
 *
 * @param tokenAddresses - Array of token addresses to fetch prices for (max 20)
 * @param oracleContract - Instance of the MockPriceFeedContract
 * @param wallet - Wallet to simulate the calls with
 * @param from - Address to simulate the calls from
 * @returns Map of token address to price (in USD, scaled by 1e4)
 */
export async function batchSimulatePrices(
  tokenAddresses: AztecAddress[],
  oracleContract: MockPriceFeedContract,
  wallet: BaseWallet,
  from: AztecAddress
): Promise<Map<AztecAddress, bigint>> {

  // Chunk the prices into groups for each call
  if (tokenAddresses.length > 8) // change to 64 once new price oracle function added
    throw new Error('Can only fetch prices for up to 64 tokens at a time');
  const chunkedAddresses: AztecAddress[][] = [];
  const chunkSize = 2; // update to 16 once new price oracle function added
  for (let i = 0; i < tokenAddresses.length; i += chunkSize)
    chunkedAddresses.push(tokenAddresses.slice(i, i + chunkSize));

  // Simulate oracle calls to get prices
  const calls = chunkedAddresses.map(addressChunk =>
    oracleContract.methods.get_prices(addressChunk)
  );
  const batchResult = await new BatchCall(wallet, calls).simulate({ from });

  // parse results
  const flatResults: bigint[] = [];
  for (let i = 0; i < batchResult.length; i++) {
    const simulationResult = batchResult[i] as { storage: bigint[], len: bigint};
    for (let j = 0; j < simulationResult.len; j++) {
      flatResults.push(simulationResult.storage[j]!);
    }
  }
  const result = new Map<AztecAddress, bigint>();
  for (let i = 0; i < tokenAddresses.length; i++)
    result.set(tokenAddresses[i], flatResults[i]);

  console.log("PRICE RESULT:", result)
  return result;
}
