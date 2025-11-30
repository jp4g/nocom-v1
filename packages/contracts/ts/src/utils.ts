import { Fr } from '@aztec/aztec.js/fields';
import type { SendOptions } from '@aztec/aztec.js/wallet';
import type { TestWallet } from "@aztec/test-wallet/server";

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