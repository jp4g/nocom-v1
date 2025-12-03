// epochs are used to measure time spent in the pool without exiting private state
pub global EPOCH_LENGTH: u64 = 900; // 15 minutes per epoch
pub global SECONDS_PER_YEAR: u128 = comptime { (60 * 60 * 24 * 365) as u128 }; // 31536000 seconds

// hardcoded borrow/ lending interest rates for now
// expressed in basis points (1/100 of a percent)
pub global LEND_INTEREST: u128 = 400; // 4% apy
pub global BORROW_INTEREST: u128 = 500; // 5% apy

// fee taken by the protocol on interest accrued
// 10% fee on interest earned
pub global LENDING_PROTOCOL_FEE: u128 = comptime { 10.pow_32(17) as u128 }; 

// liquidation parameters
pub global LIQUIDATION_BONUS: u128 = 10; // 10% bonus to liquidators
pub global PROTOCOL_LIQUIDATION_FEE: u128 = 10; // 10 % of liquidation bonus
pub global LTV_THRESHOLD: u128 = comptime { 10.pow_32(5) as u128 };

// scaling for computations
pub global WAD: u128 = comptime { 10.pow_32(18) as u128 }; // 1e18
pub global BONUS_BASE: u128 = 100; // base for liquidation bonus calculations
pub global LTV_RATIO_BASE: u128 = comptime { 10.pow_32(14) as u128 }; // base for LTV ratio calculations
pub global LTV_BASE: u128 = comptime { 10.pow_32(4) as u128 }; // base for LTV calculations
pub global PRICE_BASE: u128 = comptime { 10.pow_32(4) as u128 }; // base for price feed values
pub global INTEREST_BASE: u128 = comptime { 10.pow_32(9) as u128 }; // base for interest rate calculations
pub global U128_MAX: u128 = comptime { (2.pow_32(128) - 1) as u128 }; // max u128 value
