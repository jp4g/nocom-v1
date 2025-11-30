import { precision } from "./utils";

export const EPOCH_LENGTH = 450; // 7.5 minutes
export const LEND_INTEREST = 40n; // 4.0%
export const BORROW_INTEREST = 50n; // 5.0%

export const WAD = precision();
export const INTEREST_BASE = precision(1n, 9n);
export const SECONDS_PER_YEAR = 31536000n;

export const ZCASH_LTV = precision(75n, 3n);
export const ZCASH_LIQUIDATION_THRESHOLD = precision(80n, 3n);

export const TOKEN_METADATA = {
    zcash: {
        name: "ZCash",
        symbol: "ZEC",
        decimals: 18,
    },
    usdc: {
        name: "USD Coin",
        symbol: "USDC",
        decimals: 18,
    },
}