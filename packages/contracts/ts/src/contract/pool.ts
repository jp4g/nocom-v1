import type { BaseWallet } from "@aztec/aztec.js/wallet";
import type { AztecAddress } from "@aztec/aztec.js/addresses";
import type { TxReceipt } from "@aztec/stdlib/tx";
import type { NocomLendingPoolV1Contract, TokenContract } from "../artifacts";
import { privateTransferAuthwit } from "./token";
import type { SendInteractionOptions, WaitOpts } from "@aztec/aztec.js/contracts";

export async function supplyLiquidity(
    wallet: BaseWallet,
    from: AztecAddress,
    poolContract: NocomLendingPoolV1Contract,
    tokenContract: TokenContract,
    amount: bigint,
    opts: { send: SendInteractionOptions, wait?: WaitOpts } = { send: { from }}
): Promise<TxReceipt> {
    // 1. create authwit
    const { authwit, nonce } = await privateTransferAuthwit(
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