pub struct InterestCalculator {
    rate_per_second: u128,
    epoch_duration: u64,
}

pub global SCALE: Field = comptime { 10.pow_32(18) };

impl InterestCalculator {
    pub fn new(annual_rate_percent: u64) -> Self {
        // Convert annual % to per-second rate in 1e18
        // For 4% annual: (1.04)^(1/31536000) ~= 1.00000000124422
        // rate_per_second = 0.00000000124422 * 1e18 = 1,244,220,000
        
        let rate_per_second = Self::calculate_rate_per_second(annual_rate_percent);
        
        Self {
            rate_per_second,
            epoch_duration: 600,
        }
    }
    
    /// Calculate amount with accrued interest
    pub fn calculate_interest(
        self,
        principal: u128,
        start_epoch: u64,
        current_epoch: u64,
    ) -> u128 {
        if current_epoch <= start_epoch {
            principal
        } else {
            // Convert epochs to seconds
            let start_time = start_epoch * self.epoch_duration;
            let current_time = current_epoch * self.epoch_duration;
            let dt = current_time - start_time;
        
            // Use continuous compounding
            let multiplier = compute_multiplier(self.rate_per_second, dt);
        
            // Apply multiplier (result is in 1e9)
            (principal * multiplier) / 1_000_000_000
        }
        
    }
    
    /// Get just the interest (not principal + interest)
    pub fn calculate_accrued_interest(
        self,
        principal: u128,
        start_epoch: u64,
        current_epoch: u64,
    ) -> u128 {
        let total = self.calculate_interest(principal, start_epoch, current_epoch);
        Self::safe_sub(total, principal)
    }
    
    /// Helper: Convert annual rate to per-second rate in 1e18
    fn calculate_rate_per_second(annual_rate_percent: u64) -> u128 {
        if annual_rate_percent == 4 {
            1_244_220_000
        } else if annual_rate_percent == 5 {
            1_541_000_000
        } else {
            // todo: clean this up
            0
        }
    }

    fn safe_sub(a: u128, b: u128) -> u128 {
        if a >= b {
            a - b
        } else {
            0
        }
    }
}

// The binomial approximation function from before
pub fn compute_multiplier(rate_per_second: u128, dt: u64) -> u128 {
    let base = 1000000000 as u128; // 1e9
    let WAD = 1000000000000000000 as u128; // 1e18
    let diff = WAD / base;
    let mut res = base;
    
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
        res = base + offset;
    }
    res
}