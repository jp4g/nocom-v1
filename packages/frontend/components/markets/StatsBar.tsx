'use client';

import { formatCurrency } from '@/lib/utils';
import { useDataContext } from '@/contexts/DataContext';
import { useWallet } from '@/hooks/useWallet';
import { Loader2 } from 'lucide-react';
import { useMemo } from 'react';

// Convert token amount to USD value
// amount is in 18 decimals, price is in 1e4 scale
function tokenAmountToUSD(amount: bigint, price: bigint | undefined): number {
  if (!price) return 0;
  // amount / 1e18 * price / 1e4 = (amount * price) / 1e22
  return Number((amount * price)) / 1e22;
}

export default function StatsBar() {
  const { contracts } = useWallet();
  const { markets, prices, marketConfigs } = useDataContext();

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
        <div className="text-2xl font-mono font-medium text-white">{marketConfigs.length}</div>
      </div>
      <div>
        <div className="text-xs text-text-muted uppercase tracking-wider mb-1 font-medium">Protocol Yield (24h)</div>
        <div className="text-2xl font-mono font-medium text-brand-purple">4.82%</div>
      </div>
    </div>
  );
}
