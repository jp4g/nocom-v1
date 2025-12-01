import { Market } from './types';

export const MARKET_DATA: Market[] = [
  { id: '1', loanAsset: 'USDC', collateralAsset: 'ZEC', supplyApy: 4.00, borrowApy: 5.00, totalSupply: 4200000, totalBorrow: 1100000, utilization: 26.2 },
  { id: '2', loanAsset: 'ZEC', collateralAsset: 'USDC', supplyApy: 4.00, borrowApy: 5.00, totalSupply: 850000, totalBorrow: 420000, utilization: 49.4 }
];
