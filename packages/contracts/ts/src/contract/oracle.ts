import type { BaseWallet } from "@aztec/aztec.js/wallet";
import type { AztecAddress } from "@aztec/aztec.js/addresses";
import type { MockPriceFeedContract } from "../artifacts";
import type { SendInteractionOptions, WaitOpts } from "@aztec/aztec.js/contracts";
import type { TxReceipt } from "@aztec/stdlib/tx";

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
    if (assetAddresses.length > 0 || prices.length === 0)
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