'use client';

import { MARKET_DATA } from '@/lib/mockData';
import { formatCurrency } from '@/lib/utils';
import { useMarketData, MarketWithContract } from '@/hooks/useMarketData';
import { usePriceOracle } from '@/hooks/usePriceOracle';
import { useWallet } from '@/hooks/useWallet';
import { Loader2 } from 'lucide-react';
import { useMemo } from 'react';
import { AztecAddress } from '@aztec/aztec.js/addresses';

// Scale token amounts from 18 decimals to regular numbers
function scaleTokenAmount(amount: bigint): number {
  return Number(amount) / 1e18;
}

// Convert token amount to USD value
// amount is in 18 decimals, price is in 1e4 scale
function tokenAmountToUSD(amount: bigint, price: bigint | undefined): number {
  if (!price) return 0;
  // amount / 1e18 * price / 1e4 = (amount * price) / 1e22
  return Number((amount * price)) / 1e22;
}

export default function StatsBar() {
  const { contracts, wallet: walletHandle, activeAccount } = useWallet();

  // Extract wallet instance and address
  const wallet = useMemo(() => walletHandle?.instance, [walletHandle]);
  const address = useMemo(() =>
    activeAccount?.address ? AztecAddress.fromString(activeAccount.address) : undefined,
    [activeAccount?.address]
  );

  // Build market configs with contract instances
  const marketConfigs = useMemo(() => {
    if (!contracts) return [];

    return [
      {
        id: contracts.pools.usdcToZec.address.toString(),
        loanAsset: 'ZEC', // This pool holds ZEC (zecDebtPool)
        collateralAsset: 'USDC',
        poolAddress: contracts.pools.usdcToZec.address.toString(),
        supplyApy: 4.00,
        borrowApy: 5.00,
        totalSupply: 0,
        totalBorrow: 0,
        utilization: 0,
        contract: contracts.pools.usdcToZec,
      },
      {
        id: contracts.pools.zecToUsdc.address.toString(),
        loanAsset: 'USDC', // This pool holds USDC (usdcDebtPool)
        collateralAsset: 'ZEC',
        poolAddress: contracts.pools.zecToUsdc.address.toString(),
        supplyApy: 4.00,
        borrowApy: 5.00,
        totalSupply: 0,
        totalBorrow: 0,
        utilization: 0,
        contract: contracts.pools.zecToUsdc,
      }
    ];
  }, [contracts]);

  const { markets } = useMarketData(marketConfigs, wallet, address);

  // Fetch token prices
  const tokenPrices = useMemo(() => {
    if (!contracts) return [];
    return [
      { address: contracts.tokens.usdc.address, symbol: 'USDC' },
      { address: contracts.tokens.zec.address, symbol: 'ZEC' },
    ];
  }, [contracts]);

  const { prices } = usePriceOracle(
    tokenPrices,
    contracts?.oracle,
    wallet,
    address
  );

  // Calculate USD aggregates manually
  const aggregatesUSD = useMemo(() => {
    let totalSuppliedUSD = 0;
    let totalBorrowedUSD = 0;
    let allLoaded = true;

    marketConfigs.forEach((config) => {
      const marketData = markets.get(config.poolAddress);

      if (marketData?.status === 'loaded' && marketData.data) {
        // Get the token price for this pool's loan asset
        const tokenAddress = config.loanAsset === 'USDC'
          ? contracts?.tokens.usdc.address.toString()
          : contracts?.tokens.zec.address.toString();

        const tokenPrice = tokenAddress ? prices.get(tokenAddress)?.price : undefined;

        if (tokenPrice) {
          totalSuppliedUSD += tokenAmountToUSD(marketData.data.totalSupplied, tokenPrice);
          totalBorrowedUSD += tokenAmountToUSD(marketData.data.totalBorrowed, tokenPrice);
        }
      } else if (marketData?.status === 'loading') {
        allLoaded = false;
      }
    });

    return {
      status: allLoaded ? ('loaded' as const) : ('loading' as const),
      totalSuppliedUSD,
      totalBorrowedUSD,
    };
  }, [markets, marketConfigs, prices, contracts]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 p-6 rounded-xl bg-surface border border-surface-border">
      <div>
        <div className="text-xs text-text-muted uppercase tracking-wider mb-1 font-medium">Total Loaned Out</div>
        <div className="text-2xl font-mono font-medium text-white">
          {aggregatesUSD.status === 'loading' && (
            <Loader2 className="w-6 h-6 animate-spin" />
          )}
          {aggregatesUSD.status === 'loaded' && (
            formatCurrency(aggregatesUSD.totalSuppliedUSD)
          )}
        </div>
      </div>
      <div>
        <div className="text-xs text-text-muted uppercase tracking-wider mb-1 font-medium">Total Utilized</div>
        <div className="text-2xl font-mono font-medium text-white">
          {aggregatesUSD.status === 'loading' && (
            <Loader2 className="w-6 h-6 animate-spin" />
          )}
          {aggregatesUSD.status === 'loaded' && (
            formatCurrency(aggregatesUSD.totalBorrowedUSD)
          )}
        </div>
      </div>
      <div>
        <div className="text-xs text-text-muted uppercase tracking-wider mb-1 font-medium">Active Markets</div>
        <div className="text-2xl font-mono font-medium text-white">{MARKET_DATA.length}</div>
      </div>
      <div>
        <div className="text-xs text-text-muted uppercase tracking-wider mb-1 font-medium">Protocol Yield (24h)</div>
        <div className="text-2xl font-mono font-medium text-brand-purple">4.82%</div>
      </div>
    </div>
  );
}
