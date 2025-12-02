'use client';

import { MARKET_DATA } from '@/lib/mockData';
import { formatCurrency } from '@/lib/utils';
import { useMarketData, MarketWithContract } from '@/hooks/useMarketData';
import { useWallet } from '@/hooks/useWallet';
import { Loader2 } from 'lucide-react';
import { useMemo } from 'react';
import { AztecAddress } from '@aztec/aztec.js/addresses';

// Scale token amounts from 18 decimals to regular numbers
function scaleTokenAmount(amount: bigint): number {
  return Number(amount) / 1e18;
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
        loanAsset: 'USDC',
        collateralAsset: 'ZEC',
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
        loanAsset: 'ZEC',
        collateralAsset: 'USDC',
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

  const { aggregates } = useMarketData(marketConfigs, wallet, address);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 p-6 rounded-xl bg-surface border border-surface-border">
      <div>
        <div className="text-xs text-text-muted uppercase tracking-wider mb-1 font-medium">Total Loaned Out</div>
        <div className="text-2xl font-mono font-medium text-white">
          {aggregates.status === 'loading' && (
            <Loader2 className="w-6 h-6 animate-spin" />
          )}
          {aggregates.status === 'loaded' && aggregates.totalSupplied !== undefined && (
            formatCurrency(scaleTokenAmount(aggregates.totalSupplied))
          )}
        </div>
      </div>
      <div>
        <div className="text-xs text-text-muted uppercase tracking-wider mb-1 font-medium">Total Utilized</div>
        <div className="text-2xl font-mono font-medium text-white">
          {aggregates.status === 'loading' && (
            <Loader2 className="w-6 h-6 animate-spin" />
          )}
          {aggregates.status === 'loaded' && aggregates.totalBorrowed !== undefined && (
            formatCurrency(scaleTokenAmount(aggregates.totalBorrowed))
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
