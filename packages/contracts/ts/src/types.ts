export type LoanPosition = {
    startingEpoch: number,
    principal: bigint,
    interest: bigint
}

export type DebtPosition = LoanPosition & {
    collateral: bigint,
}

export type LiquidationResult = {
  totalCollateralSeized: bigint;
  liquidatorCollateralAmount: bigint;
  protocolFee: bigint;
}

export type UtilizationSimulationResult = {
  total_supplied: bigint,
  total_borrowed: bigint
}