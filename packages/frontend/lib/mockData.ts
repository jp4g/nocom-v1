import { Market } from './types';

export const MARKET_DATA: Market[] = [
  {
    id: '1',
    loanAsset: 'USDC',
    collateralAsset: 'ZEC',
    poolAddress: '0x17df04fb215ea57a9452cc8953b0002702797f7a908c9cf8d73654da61f9cf1a',
    supplyApy: 4.00,
    borrowApy: 5.00,
    totalSupply: 4200000,
    totalBorrow: 1100000,
    utilization: 26.2
  },
  {
    id: '2',
    loanAsset: 'ZEC',
    collateralAsset: 'USDC',
    poolAddress: '0x214c1019b42b02d92cdafcd3d876846102d3e39781ae8243ee58683660eb9b23',
    supplyApy: 4.00,
    borrowApy: 5.00,
    totalSupply: 850000,
    totalBorrow: 420000,
    utilization: 49.4
  }
];
