import { BaseWallet } from "@aztec/aztec.js/wallet";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import type { TokenContract } from "../artifacts";
import { AuthWitness } from "@aztec/stdlib/auth-witness";
import { Fr } from "@aztec/aztec.js/fields";

export async function privateTransferAuthwit(
    wallet: BaseWallet,
    from: AztecAddress,
    token: TokenContract,
    caller: AztecAddress,
    to: AztecAddress,
    amount: bigint,
): Promise<{ authwit: AuthWitness, nonce: Fr }> {
    // construct call data
    const nonce = Fr.random();
    const call = await token.withWallet(wallet).methods.transfer_private_to_private(
        from,
        to,
        amount,
        nonce,
    ).getFunctionCall();
    // construct private authwit
    const authwit = await wallet.createAuthWit(from, { caller, call });
    return { authwit, nonce }
}

