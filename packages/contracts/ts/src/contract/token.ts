import { BaseWallet } from "@aztec/aztec.js/wallet";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import type { TokenContract } from "../artifacts";
import { AuthWitness } from "@aztec/stdlib/auth-witness";
import { Fr } from "@aztec/aztec.js/fields";

/**
 * Get `transfer_private_to_X` authwit
 * 
 * @param wallet - wallet intance holding the `from` account
 * @param from - address to approve tokens being spent from
 * @param token - token contract
 * @param caller - the address of the contract calling `transfer_private_to_X`
 * @param to - the receipient of the transfer
 * @param amount - amount to transfer
 * @returns 
 *  - authwit for the transfer
 *  - nonce used for authwit
 */
export async function privateTransferAuthwit(
    wallet: BaseWallet,
    from: AztecAddress,
    token: TokenContract,
    method: 'transfer_private_to_public' | 'transfer_private_to_private',
    caller: AztecAddress,
    to: AztecAddress,
    amount: bigint,
): Promise<{ authwit: AuthWitness, nonce: Fr }> {
    // construct call data
    const nonce = Fr.random();
    const call = await token.methods[method](
        from,
        to,
        amount,
        nonce,
    ).getFunctionCall();
    // construct private authwit
    const authwit = await wallet.createAuthWit(from, { caller, call });
    return { authwit, nonce }
}

/**
 * Get `burn_private` authwit
 * 
 * @param wallet - wallet intance holding the `from` account
 * @param from - address to approve tokens being burned from
 * @param token - token contract
 * @param caller - the address of the contract calling `burn_private`
 * @param amount - amount to burn
 * @returns 
 *  - authwit for the burn
 *  - nonce used for authwit
 */
export async function burnPrivateAuthwit(
    wallet: BaseWallet,
    from: AztecAddress,
    token: TokenContract,
    caller: AztecAddress,
    amount: bigint,
): Promise<{ authwit: AuthWitness, nonce: Fr }> {
    // construct call data
    const nonce = Fr.random();
    const call = await token.methods.burn_private(
        from,
        amount,
        nonce,
    ).getFunctionCall();
    // construct private authwit
    const authwit = await wallet.createAuthWit(from, { caller, call });
    return { authwit, nonce }
}



