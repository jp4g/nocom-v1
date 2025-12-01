export interface Market {
  id: string;
  loanAsset: string;
  collateralAsset: string;
  supplyApy: number;
  borrowApy: number;
  totalSupply: number;
  totalBorrow: number;
  utilization: number;
}
