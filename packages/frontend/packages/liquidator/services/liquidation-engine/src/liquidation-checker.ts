import type {
  CollateralPosition,
  LiquidationEligibility,
  LiquidationParams,
  Price,
} from '@liquidator/shared';
import {
  calculateHealthFactor,
  calculateAccruedInterest,
  MOCK_INTEREST_RATE,
  MOCK_COLLATERALIZATION_THRESHOLD,
  MOCK_LIQUIDATION_BONUS,
} from '@liquidator/shared';
import type { Logger } from 'pino';

/**
 * Liquidation Checker
 * Determines which positions are eligible for liquidation
 */
export class LiquidationChecker {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Check if a position is eligible for liquidation
   */
  checkEligibility(
    position: CollateralPosition,
    collateralPrice: number
  ): LiquidationEligibility {
    // Calculate current collateral value
    const collateralValue = position.collateralAmount * collateralPrice;

    // Calculate accrued interest on debt
    const timeElapsed = Date.now() - position.lastUpdated;
    const accruedInterest = calculateAccruedInterest(
      position.debtAmount,
      MOCK_INTEREST_RATE,
      timeElapsed
    );

    // Total debt including interest
    const totalDebt = position.debtAmount + accruedInterest;

    // Calculate health factor
    // Health factor = collateralValue / (debtValue * threshold)
    // If health factor < 1.0, position is underwater and liquidatable
    const healthFactor = calculateHealthFactor(
      collateralValue,
      totalDebt,
      MOCK_COLLATERALIZATION_THRESHOLD
    );

    const isLiquidatable = healthFactor < 1.0;

    this.logger.debug(
      {
        escrow: position.escrowAddress,
        collateralValue,
        totalDebt,
        healthFactor,
        isLiquidatable,
      },
      'Position eligibility checked'
    );

    return {
      escrowAddress: position.escrowAddress,
      collateralValue,
      debtValue: totalDebt,
      healthFactor,
      isLiquidatable,
    };
  }

  /**
   * Calculate liquidation parameters for an eligible position
   */
  calculateLiquidationParams(
    position: CollateralPosition,
    collateralPrice: number,
    eligibility: LiquidationEligibility
  ): LiquidationParams {
    // Calculate max liquidatable amount (50% of debt)
    const maxLiquidationAmount = eligibility.debtValue * 0.5;

    // Calculate collateral to seize
    // collateralToSeize = liquidationAmount / collateralPrice * (1 + bonus)
    const collateralToSeize =
      (maxLiquidationAmount / collateralPrice) *
      (1 + MOCK_LIQUIDATION_BONUS);

    // Expected profit = bonus amount in collateral value terms
    const expectedProfit = (maxLiquidationAmount / collateralPrice) * MOCK_LIQUIDATION_BONUS * collateralPrice;

    const params: LiquidationParams = {
      escrowAddress: position.escrowAddress,
      collateralAsset: position.collateralAsset,
      debtAsset: position.debtAsset,
      liquidationAmount: maxLiquidationAmount,
      collateralToSeize,
      expectedProfit,
    };

    this.logger.info({ params }, 'Liquidation parameters calculated');

    return params;
  }

  /**
   * Check multiple positions and return liquidatable ones
   */
  checkPositions(
    positions: CollateralPosition[],
    prices: Map<string, number>
  ): {
    eligiblePositions: LiquidationEligibility[];
    liquidationParams: LiquidationParams[];
  } {
    const eligiblePositions: LiquidationEligibility[] = [];
    const liquidationParams: LiquidationParams[] = [];

    for (const position of positions) {
      const collateralPrice = prices.get(position.collateralAsset);

      if (!collateralPrice) {
        this.logger.warn(
          { asset: position.collateralAsset, escrow: position.escrowAddress },
          'No price available for collateral asset, skipping'
        );
        continue;
      }

      const eligibility = this.checkEligibility(position, collateralPrice);

      if (eligibility.isLiquidatable) {
        eligiblePositions.push(eligibility);

        const params = this.calculateLiquidationParams(
          position,
          collateralPrice,
          eligibility
        );
        liquidationParams.push(params);
      }
    }

    this.logger.info(
      {
        totalPositions: positions.length,
        liquidatablePositions: eligiblePositions.length,
      },
      'Position check completed'
    );

    return { eligiblePositions, liquidationParams };
  }
}
