import { precision } from "./utils";

export const WAD = precision(); // 1e18
export const LEND_INTEREST = 400n;
export const BORROW_INTEREST = 500n;

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