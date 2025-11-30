import {
    EPOCH_LENGTH,
    INTEREST_BASE,
    SECONDS_PER_YEAR,
    WAD,
    LTV_BASE,
    LTV_RATIO_BASE,
    PRICE_BASE,
    LIQUIDATION_BONUS,
    BONUS_BASE,
    PROTOCOL_LIQUIDATION_FEE
} from "../constants";
import type { LiquidationResult } from "../types";

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

/**
 * Approximately calculates the amount withdrawn to determine what share of interest should 
 * be extracted for a protocol fee
 * @param total - total amount being withdrawn from
 * @param amountToWithdraw - amount being withdrawn
 * @return withdrawRatio - ratio of amount being withdrawn scaled to LTV_BASE
 */
export function calculateWithdrawRatio(
  total: bigint,
  amountToWithdraw: bigint
): bigint {
  const totalScaled = total / LTV_RATIO_BASE;
  const amountScaled = amountToWithdraw / LTV_RATIO_BASE;
  return (amountScaled * LTV_BASE) / totalScaled;
}

/**
 * Calculates the amount of collateral to be seized during liquidation
 *
 * @param debtAmount - amount of debt being repaid (in WAD)
 * @param debtPrice - price of the debt asset (in PRICE_BASE)
 * @param collateralPrice - price of the collateral asset (in PRICE_BASE)
 * @return LiquidationResult containing (totalCollateralSeized, liquidatorCollateralAmount, protocolFee)
 */
export function calculateLiquidation(
  debtAmount: bigint,
  debtPrice: bigint,
  collateralPrice: bigint
): LiquidationResult {
  // 1. calculate the value of the debt being repaid
  const debtValue = (debtAmount * debtPrice) / PRICE_BASE;
  
  // 2. calculate the amount of collateral needed to cover this value
  const collateralAmount = (debtValue * PRICE_BASE) / collateralPrice;
  
  // 3. calculate the total liquidation bonus (10% of collateral seized)
  const totalLiquidationBonus = (collateralAmount * LIQUIDATION_BONUS) / BONUS_BASE;
  
  // 4. calculate the protocol fee on the bonus (10% of bonus)
  const protocolFee = (totalLiquidationBonus * PROTOCOL_LIQUIDATION_FEE) / BONUS_BASE;
  
  // 5. get the final amounts for each party
  const totalCollateralSeized = collateralAmount + totalLiquidationBonus;
  const liquidatorCollateralAmount = totalCollateralSeized - protocolFee;
  
  return {
    totalCollateralSeized,
    liquidatorCollateralAmount,
    protocolFee
  };
}

/**
 * Calculates the LTV health ratio.
 * @notice can be used with liquidation threshold as well (as max LTV)
 * @notice should be above LTV_THRESHOLD to be healthy
 *
 * @param loanedAssetPrice - price of the loaned asset (in PRICE_BASE)
 * @param loanedAssetAmount - amount of the loaned asset (in WAD)
 * @param collateralAssetPrice - price of the collateral asset (in PRICE_BASE)
 * @param collateralAssetAmount - amount of the collateral asset (in WAD)
 * @param maxLtv - maximum loan-to-value ratio allowed (in LTV_BASE)
 * @return LTV health ratio
 */
export function calculateLtvHealth(
  loanedAssetPrice: bigint,
  loanedAssetAmount: bigint,
  collateralAssetPrice: bigint,
  collateralAssetAmount: bigint,
  maxLtv: bigint
): bigint {
  // 1. calculate the value of the loan and collateral
  const loanValue = (loanedAssetAmount * loanedAssetPrice) / PRICE_BASE;
  const collateralValue = (collateralAssetAmount * collateralAssetPrice) / PRICE_BASE;

  // 2. scale values so they don't overflow
  // todo: investigate bigint precision handling
  const collateralValueScaled = collateralValue / LTV_RATIO_BASE;
  const loanValueScaled = loanValue / LTV_RATIO_BASE;

  // 3. determine the current LTV
  if (loanValueScaled === 0n) {
    return 0n;
  } else {
    // weight the collateral value by the max 
    const weightedCollateralValue = (collateralValueScaled * maxLtv) / LTV_BASE;
    // finally calculate the LTV
    return (weightedCollateralValue * LTV_BASE) / loanValueScaled;
  }
}