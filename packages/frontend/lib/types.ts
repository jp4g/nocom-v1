import { MockPriceFeedContract, NocomLendingPoolV1Contract, TokenContract } from "@nocom-v1/contracts/artifacts";

export interface Market {
  id: string;
  loanAsset: string;
  collateralAsset: string;
  poolAddress: string;
  supplyApy: number;
  borrowApy: number;
  totalSupply: number;
  totalBorrow: number;
  utilization: number;
}

export interface MarketUtilization {
  totalSupplied: bigint;
  totalBorrowed: bigint;
}

export interface MarketDataState {
  status: 'loading' | 'loaded' | 'error';
  data?: MarketUtilization;
  error?: string;
}

export interface AggregateMarketData {
  status: 'loading' | 'loaded';
  totalSupplied?: bigint;
  totalBorrowed?: bigint;
  utilization?: number;
}

export interface NocomPublicContracts {
  oracle: MockPriceFeedContract;
  tokens: Record<string, TokenContract>;
  pools: Record<string, NocomLendingPoolV1Contract>;
}