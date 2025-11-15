use crate::NocomLendingPoolV1::EPOCH_LENGTH;
pub struct InterestCalculator {
    rate_per_second: u128,
    epoch_duration: u64,
}

pub global WAD: u128 = comptime { 10.pow_32(18) as u128}; // 1e18
pub global U128_MAX: u128 = comptime { (2.pow_32(128) - 1) as u128 }; 
pub global BASE: u128 = comptime { 10.pow_32(9) as u128 }; // 1e9
pub global SECONDS_PER_YEAR: u128 = comptime { (60 * 60 * 24 * 365) as u128 }; // 31536000 seconds

pub fn calculate_interest(
    principal: u128,
    start_epoch: u64,
    current_epoch: u64,
    epoch_duration: u64,
    interest_rate: u128 // example: for 4.2% use 42
) -> u128 {
    let rate_per_second = apy_to_rate_per_second(interest_rate);
    let mut interest = principal;
    if current_epoch > start_epoch {
        // Convert epochs to seconds
        let start_time = start_epoch * epoch_duration;
        let current_time = current_epoch * epoch_duration;
        let dt = current_time - start_time;

        // Use continuous compounding
        let multiplier = compute_multiplier(rate_per_second, dt);

        // Apply multiplier (result is in 1e9)
        interest = (principal * multiplier) / BASE
    }
    interest
}

fn apy_to_rate_per_second(apy: u128) -> u128 {
    // Args: apy as tenths of percent (e.g., 52 for 5.2%)
    let numerator = (apy as u128) * WAD;
    let denominator = 1000 * SECONDS_PER_YEAR; // 1000 instead of 100 since tenths
    numerator / denominator
}

// Binomial approximation of exponential
// using lower than desired precisions for everything due to u128 limit
// (1+x)^n = 1+n*x+[n/2*(n-1)]*x^2+[n/6*(n-1)*(n-2)*x^3]...
// we are losing around almost 8 digits of precision from yearly -> daily interest
// dividing with 31536000 (seconds per year).
// rate must be measured with higher precision than 10^9.
// we use e18, and rates >= 4% yearly. Otherwise need more precision
// https://github.com/AztecProtocol/aztec-packages/blob/101f928e84dc040c051793d0d1f47519e0273618/noir-projects/noir-contracts/contracts/app/lending_contract/src/interest_math.nr#L10
fn compute_multiplier(rate_per_second: u128, dt: u64) -> u128 {
    
    let diff = WAD / BASE;
    let mut res = BASE;

    if dt != 0 {
        let exp_minus_one = (dt - 1) as u128;
        let exp_minus_two = (if dt > 2 { dt - 2 } else { 0 }) as u128;
        let dt = dt as u128;

        let rate = rate_per_second;
        let base_power_two = (rate * rate) / WAD;
        let base_power_three = (base_power_two * rate) / WAD;

        let temp = dt * exp_minus_one;
        let second_term = temp * base_power_two / 2;
        let third_term = temp * exp_minus_two * base_power_three / 6;

        let offset = (dt * rate + second_term + third_term) / diff;
        res = BASE + offset;
    }
    res
}

// ============================================================================
// Unit Tests
// ============================================================================

// #[test]
// fn test_compute_multiplier_zero_time() {
//     let rate = apy_to_rate_per_second(40);
//     let multiplier = compute_multiplier(rate, 0);
//     assert(multiplier == BASE); // Exactly 1e9 (base)
// }

// #[test]
// fn test_compute_multiplier_one_second_4_percent() {
//     let rate = apy_to_rate_per_second(40);
//     let expected_rate = 1_268_391_679;
//     assert(rate == expected_rate);

//     let multiplier = compute_multiplier(rate, 1);
//     let expected_multiplier = 1_000_000_001; // 1e9 * 1.000000001
//     assert(multiplier == expected_multiplier);
// }

// #[test]
// fn test_compute_multiplier_one_epoch_4_percent() {
//     let rate = apy_to_rate_per_second(40);
//     let multiplier = compute_multiplier(rate, EPOCH_LENGTH); // 1 epoch = 600 seconds
    
//     let expected_multiplier = 1000000761;
//     assert(multiplier == expected_multiplier);
// }

// #[test]
// fn test_compute_multiplier_one_epoch_5_percent() {
//     let rate = apy_to_rate_per_second(50);
//     let expected_rate = 1_585_489_599;

//     let multiplier = compute_multiplier(rate, EPOCH_LENGTH);
//     let expected_multiplier = 1_000_000_951;
//     assert(multiplier == expected_multiplier);
// }

// #[test]
// fn test_calculate_interest_zero_time() {
//     let principal = 1000 * WAD as u128;
//     let interest_rate = 40;
//     let result = calculate_interest(principal, 100, 100, EPOCH_LENGTH, interest_rate);
//     assert(result == principal);
// }

#[test]
fn test_calculate_interest_backward_time() {
    let principal = 1000 * WAD as u128;
    let interest_rate = 40;
    let result = calculate_interest(principal, 200, 60, EPOCH_LENGTH, interest_rate);
    assert(result == principal);
}

#[test]
fn test_calculate_interest_one_epoch_4_percent() {
    let principal = 1000 * WAD as u128;
    let interest_rate = 40;
    let result = calculate_interest(principal, 200, 60, EPOCH_LENGTH, interest_rate);
    let expected_result = 1_000_000_761_000_000_000_000;
    assert(result == expected_result);
}

#[test]
fn test_calculate_interest_one_year_4_percent() {
    let principal = 1000 * WAD as u128;
    let interest_rate = 40;
    let result = calculate_interest(principal, 200, 60, EPOCH_LENGTH, interest_rate);
    println("result");
    println(result);
    let expected_result = 1_040_497_259_000_000_000_000;
    println("expected");
    println(expected_result);
    assert(result == expected_result);
}

// test with large amount over long time