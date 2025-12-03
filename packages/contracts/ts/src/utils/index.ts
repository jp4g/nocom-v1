import { Fr } from '@aztec/aztec.js/fields';
import type { SendOptions } from '@aztec/aztec.js/wallet';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { TestWallet } from "@aztec/test-wallet/server";
import { CheatCodes } from "@aztec/aztec/testing";
import type { TokenContract } from '../contract/artifacts';

export * as math from "./math";

export function precision(n: bigint = 1n, decimals: bigint = 18n): bigint {
    return n * 10n ** decimals;
}

export async function createSchnorrAccount(wallet: TestWallet) {
    const secret = Fr.random()
    const salt = Fr.random();
    const manager = await wallet.createSchnorrAccount(secret, salt);
    const address = await manager.getAccount().then(acc => acc.getAddress());
    const feeOpts: SendOptions = {
        from: address,
        fee: {

        }
    };
}

export function utilizationRatio(supplied: bigint, borrowed: bigint): number {
    if (supplied === 0n) return 0;
    return Number(borrowed * 1_000n / supplied) / 1_000;
}

/**
 * Advance time in the aztec sandbox
 * @notice hardcoded to advance time by ~12 hours, can only do up to ~18 hours per advancement
 * @notice requires a tx to be mined to advance so we mint 1 token to the 0 address
 * 
 * @param cheatcodes - the cheatcodes instance
 * @param from - the address to send the mint tx from
 * @param token - the token contract to use for the mint tx
 **/
export async function advanceTime(
    cheatcodes: CheatCodes,
    from: AztecAddress,
    token: TokenContract,
) {
    // advance epoch
    const currentEpoch = await cheatcodes.rollup.getEpoch();
    await cheatcodes.rollup.advanceToEpoch(currentEpoch + 60n);
    // mine a tx to apply the time advancement
    await token.methods.mint_to_public(AztecAddress.ZERO, 1n)
        .send({ from })
        .wait();
}