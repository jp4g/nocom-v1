import { precision } from "./utils";

export const EPOCH_LENGTH = 900; // 15 minutes
export const LEND_INTEREST = 40n; // 4.0%
export const BORROW_INTEREST = 50n; // 5.0%

export const WAD = precision();
export const INTEREST_BASE = precision(1n, 9n);
export const SECONDS_PER_YEAR = 31536000n;

export const LTV_BASE = precision(1n, 4n);
export const LTV_RATIO_BASE = precision(1n, 14n);
export const PRICE_BASE = precision(1n, 4n);
export const LIQUIDATION_BONUS = 1000n; // 10% = 1000/10000
export const BONUS_BASE = 100n;
export const PROTOCOL_LIQUIDATION_FEE = 10n; // 10% of bonus

export const HEALTH_FACTOR_THRESHOLD = precision(1n, 5n);

export const USDC_LTV = precision(85n, 3n);
export const USDC_LIQUIDATION_THRESHOLD = precision(90n, 3n);
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