import {
    EPOCH_LENGTH,
    INTEREST_BASE,
    SECONDS_PER_YEAR,
    WAD,
} from "../constants";

export function calculateEpochFromTimestamp(timestamp: number) {
    Math.ceil(timestamp / EPOCH_LENGTH)
}



/**
 * Calculate interest accrued on a principal over time using continuous compounding.
 * @notice Estimates interest - todo: use u256 with RAY math
 * @param principal - The principal amount (in WAD)
 * @param startEpoch - The epoch when the interest calculation starts
 * @param currentEpoch - The current epoch
 * @param epochDuration - Duration of an epoch in seconds
 * @param interestRate - Annual interest rate in tenths of percent (e.g., for 4.2% use 42)
 * @return interest - The accrued interest amount (in WAD)
 */
export function calculateInterest(
  principal: bigint,
  startEpoch: bigint,
  currentEpoch: bigint,
  epochDuration: bigint,
  interestRate: bigint // example: for 4.2% use 42
): bigint {
  const ratePerSecond = apyToRatePerSecond(interestRate);
  let interest = 0n;
  
  if (currentEpoch > startEpoch) {
    // Convert epochs to seconds
    const startTime = startEpoch * epochDuration;
    const currentTime = currentEpoch * epochDuration;
    const dt = currentTime - startTime;

    // Use continuous compounding
    const multiplier = computeMultiplier(ratePerSecond, dt);

    // Apply multiplier (result is in 1e9)
    interest = (principal * (multiplier - INTEREST_BASE)) / INTEREST_BASE;
  }
  
  return interest;
}

function apyToRatePerSecond(apy: bigint): bigint {
  // Args: apy as tenths of percent (e.g., 52 for 5.2%)
  const numerator = apy * WAD;
  const denominator = 1000n * SECONDS_PER_YEAR; // 1000 instead of 100 since tenths
  return numerator / denominator;
}

// Binomial approximation of exponential
function computeMultiplier(ratePerSecond: bigint, dt: bigint): bigint {
  const diff = WAD / INTEREST_BASE;
  let res = INTEREST_BASE;

  if (dt !== 0n) {
    const expMinusOne = dt - 1n;
    const expMinusTwo = dt > 2n ? dt - 2n : 0n;

    const rate = ratePerSecond;
    const basePowerTwo = (rate * rate) / WAD;
    const basePowerThree = (basePowerTwo * rate) / WAD;

    const temp = dt * expMinusOne;
    const secondTerm = temp * basePowerTwo / 2n;
    const thirdTerm = temp * expMinusTwo * basePowerThree / 6n;

    const offset = (dt * rate + secondTerm + thirdTerm) / diff;
    res = INTEREST_BASE + offset;
  }
  
  return res;
}