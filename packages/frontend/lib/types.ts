import { MockPriceFeedContract, NocomLendingPoolV1Contract, NocomStablePoolV1Contract, TokenContract } from "@nocom-v1/contracts/artifacts";

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

// Stable market doesn't have supply APY, utilization, or total borrow
export interface StableMarket {
  id: string;
  stablecoin: string;       // The stablecoin being minted (e.g., zUSD)
  collateralAsset: string;  // The collateral backing it (e.g., ZEC)
  poolAddress: string;
  borrowApy: number;
  totalSupply: number;
}

export interface MarketUtilization {
  totalSupplied: bigint;
  totalBorrowed: bigint;
}

export interface StableMarketData {
  totalSupplied: bigint;
}

export interface MarketDataState {
  status: 'loading' | 'loaded' | 'error';
  data?: MarketUtilization;
  error?: string;
}

export interface StableMarketDataState {
  status: 'loading' | 'loaded' | 'error';
  data?: StableMarketData;
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
  stablePools: Record<string, NocomStablePoolV1Contract>;
}