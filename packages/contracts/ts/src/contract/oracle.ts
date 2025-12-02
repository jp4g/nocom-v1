import type { BaseWallet } from "@aztec/aztec.js/wallet";
import type { AztecAddress } from "@aztec/aztec.js/addresses";
import type { MockPriceFeedContract } from "./artifacts";
import type { SendInteractionOptions, WaitOpts } from "@aztec/aztec.js/contracts";
import type { TxReceipt } from "@aztec/stdlib/tx";


/**
 * Updates the price oracle for one or more assets
 * @param from - the oracle admin & tx sender
 * @param oracleContract - the price oracle contract
 * @param assetAddresses - array of asset addresses to update prices for
 * @param prices - array of new prices corresponding to the asset addresses
 * @param opts - send and wait options
 * @returns receipt upon tx confirmation
 */
export async function updateOraclePrice(
    from: AztecAddress,
    oracleContract: MockPriceFeedContract,
    assetAddresses: AztecAddress[],
    prices: bigint[],
    opts: { send: SendInteractionOptions, wait?: WaitOpts } = { send: { from } }
): Promise<TxReceipt> {
    // check inputs
    if (assetAddresses.length !== prices.length)
        throw new Error("Asset addresses and prices arrays must have the same length");
    if (assetAddresses.length === 0 || prices.length === 0)
        throw new Error("Asset addresses and prices arrays must not be empty");
    if (assetAddresses.length > 4 || prices.length > 4)
        throw new Error("Asset addresses and prices arrays must not have more than 4 elements");

    if (prices.length === 1) {
        // set only one price
        return await oracleContract.methods.set_price(assetAddresses[0]!, prices[0]!)
            .send(opts.send)
            .wait(opts.wait);
    } else {
        // call set_prices
        return await oracleContract.methods.set_prices(assetAddresses, prices)
            .send(opts.send)
            .wait(opts.wait);
    }
}

/**
 * Get the currently reported price of an asset from the oracle
 * 
 * @param from - caller address
 * @param oracleContract - the price oracle contract
 * @param assetAddress - the asset to get the price for
 * @returns - the current price of the asset
 */
export async function getPrice(
    from: AztecAddress,
    oracleContract: MockPriceFeedContract,
    assetAddress: AztecAddress
): Promise<bigint> {
    const priceResult = await oracleContract.methods.get_price(assetAddress).simulate({ from });
    return priceResult;
}