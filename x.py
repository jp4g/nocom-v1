def apy_to_rate_per_second(apy: int) -> int:
    """
    Args: apy as tenths of percent (e.g., 52 for 5.2%)
    """
    WAD = 1_000_000_000_000_000_000  # 1e18
    SECONDS_PER_YEAR = 31_536_000
    
    numerator = apy * WAD
    denominator = 1000 * SECONDS_PER_YEAR  # 1000 instead of 100 since tenths
    return numerator // denominator


def compute_multiplier(rate_per_second: int, dt: int) -> int:
    WAD = 1_000_000_000_000_000_000  # 1e18
    BASE = 1_000_000_000  # 1e9
    diff = WAD // BASE
    res = BASE

    if dt != 0:
        exp_minus_one = dt - 1
        exp_minus_two = dt - 2 if dt > 2 else 0
        dt_u128 = dt

        rate = rate_per_second
        base_power_two = (rate * rate) // WAD
        base_power_three = (base_power_two * rate) // WAD

        temp = dt_u128 * exp_minus_one
        second_term = temp * base_power_two // 2
        third_term = temp * exp_minus_two * base_power_three // 6

        offset = (dt_u128 * rate + second_term + third_term) // diff
        res = BASE + offset

    return res


def calculate_interest(
    principal: int,
    start_epoch: int,
    current_epoch: int,
    epoch_duration: int,
    interest_rate: int  # tenths of percent (e.g., 42 for 4.2%)
) -> int:
    rate_per_second = apy_to_rate_per_second(interest_rate)
    interest = principal
    
    if current_epoch > start_epoch:
        start_time = start_epoch * epoch_duration
        current_time = current_epoch * epoch_duration
        dt = current_time - start_time
        
        multiplier = compute_multiplier(rate_per_second, dt)
        
        interest = (principal * multiplier) // 1_000_000_000  # BASE
    
    return interest


if __name__ == "__main__":
    # Constants
    EPOCH_DURATION = 600  # seconds
    EPOCH_DAYS = 86400 // EPOCH_DURATION  # epochs in a day
    EPOCH_YEARS = 31536000 // EPOCH_DURATION  # epochs in a year
    
    # Test cases
    print("=" * 60)
    print("INTEREST CALCULATION TESTS")
    print("=" * 60)
    
    # Test 1: 4.2% APY, 1 year, 1000 tokens
    principal = 1000 * 10**18  # 1000 tokens in WAD
    start_epoch = 0
    current_epoch = EPOCH_YEARS
    interest_rate = 40  # 4.2%
    
    result = calculate_interest(principal, start_epoch, current_epoch, EPOCH_DURATION, interest_rate)
    print(f"Result: {result}")
    print(f"Test 1: 4.0% APY, 1000 tokens, 1 year (daily epochs)")
    print(f"  Principal: {principal / 1e18:.2f} tokens")
    print(f"  Result: {result / 1e18:.10f} tokens")
    print(f"  Interest earned: {(result - principal) / 1e18:.10f} tokens")
    print(f"  Expected (simple): {1000 * 1.042:.10f} tokens")
    print()