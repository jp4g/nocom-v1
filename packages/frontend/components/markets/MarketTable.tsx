'use client';

import { MARKET_DATA } from '@/lib/mockData';
import { formatCurrency } from '@/lib/utils';
import { ArrowDown, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { useMarketData, MarketWithContract } from '@/hooks/useMarketData';
import { useWallet } from '@/hooks/useWallet';
import { useMemo } from 'react';
import { AztecAddress } from '@aztec/aztec.js/addresses';

function handleAction(action: string, asset: string) {
  console.log(`${action} clicked for ${asset}`);
}

function calculateUtilization(supplied: bigint, borrowed: bigint): number {
  if (supplied === 0n) return 0;
  return Number((borrowed * 100n) / supplied);
}

// Scale token amounts from 18 decimals to regular numbers
function scaleTokenAmount(amount: bigint): number {
  return Number(amount) / 1e18;
}

export default function MarketTable() {
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
        totalSupply: 0, // Will be filled by useMarketData
        totalBorrow: 0, // Will be filled by useMarketData
        utilization: 0, // Will be calculated from fetched data
        contract: contracts.pools.usdcToZec,
      },
      {
        id: contracts.pools.zecToUsdc.address.toString(),
        loanAsset: 'ZEC',
        collateralAsset: 'USDC',
        poolAddress: contracts.pools.zecToUsdc.address.toString(),
        supplyApy: 4.00,
        borrowApy: 5.00,
        totalSupply: 0, // Will be filled by useMarketData
        totalBorrow: 0, // Will be filled by useMarketData
        utilization: 0, // Will be calculated from fetched data
        contract: contracts.pools.zecToUsdc,
      }
    ];
  }, [contracts]);

  const { markets } = useMarketData(marketConfigs, wallet, address);

  return (
    <>
      <div className="w-full overflow-x-auto rounded-xl border border-surface-border bg-surface">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-surface-border text-xs text-text-muted uppercase tracking-wider">
              <th className="py-4 px-6 font-medium">Market Pair</th>
              <th className="py-4 px-6 font-medium text-right cursor-pointer hover:text-white transition-colors group">
                Supply APY <ArrowDown className="inline w-3 h-3 ml-1 opacity-0 group-hover:opacity-100" />
              </th>
              <th className="py-4 px-6 font-medium text-right cursor-pointer hover:text-white transition-colors group">
                Borrow APY <ArrowDown className="inline w-3 h-3 ml-1 opacity-0 group-hover:opacity-100" />
              </th>
              <th className="py-4 px-6 font-medium text-right hidden md:table-cell">Total Supply</th>
              <th className="py-4 px-6 font-medium text-right hidden md:table-cell">Total Borrow</th>
              <th className="py-4 px-6 font-medium text-right w-48">Utilization</th>
              <th className="py-4 px-6 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border text-sm">
            {marketConfigs.map((market) => {
              const marketData = markets.get(market.poolAddress);

              const utilization = marketData?.status === 'loaded' && marketData.data
                ? calculateUtilization(marketData.data.totalSupplied, marketData.data.totalBorrowed)
                : 0;

              return (
                <tr key={market.id} className="group hover:bg-surface-hover/50 transition-colors border-b border-surface-border last:border-0">
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <div className="relative flex -space-x-2">
                        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center border-2 border-surface z-10 overflow-hidden">
                          <Image
                            src={`/icons/${market.loanAsset.toLowerCase()}.svg`}
                            alt={market.loanAsset}
                            width={32}
                            height={32}
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center border-2 border-surface z-0 opacity-80 overflow-hidden">
                          <Image
                            src={`/icons/${market.collateralAsset.toLowerCase()}.svg`}
                            alt={market.collateralAsset}
                            width={32}
                            height={32}
                            className="w-full h-full object-contain"
                          />
                        </div>
                      </div>
                      <div>
                        <div className="font-medium text-white">{market.loanAsset} / {market.collateralAsset}</div>
                        <div className="text-xs text-text-muted font-mono">Isolated</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium bg-green-900/30 text-green-400 border border-green-900/50">
                      {market.supplyApy.toFixed(2)}%
                    </span>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <span className="font-mono text-text-muted font-medium">{market.borrowApy.toFixed(2)}%</span>
                  </td>
                  <td className="py-4 px-6 text-right hidden md:table-cell font-mono text-text-muted">
                    {marketData?.status === 'loading' && (
                      <Loader2 className="w-4 h-4 animate-spin inline-block" />
                    )}
                    {marketData?.status === 'loaded' && marketData.data && (
                      formatCurrency(scaleTokenAmount(marketData.data.totalSupplied))
                    )}
                    {marketData?.status === 'error' && (
                      <span className="text-red-400">Error</span>
                    )}
                  </td>
                  <td className="py-4 px-6 text-right hidden md:table-cell font-mono text-text-muted">
                    {marketData?.status === 'loading' && (
                      <Loader2 className="w-4 h-4 animate-spin inline-block" />
                    )}
                    {marketData?.status === 'loaded' && marketData.data && (
                      formatCurrency(scaleTokenAmount(marketData.data.totalBorrowed))
                    )}
                    {marketData?.status === 'error' && (
                      <span className="text-red-400">Error</span>
                    )}
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="flex flex-col items-end gap-1">
                      {marketData?.status === 'loading' && (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      )}
                      {marketData?.status === 'loaded' && (
                        <>
                          <span className="text-xs font-mono text-text-muted">{utilization.toFixed(1)}%</span>
                          <div className="w-24 h-1.5 bg-surface-border rounded-full overflow-hidden">
                            <div className="h-full bg-brand-purple rounded-full" style={{ width: `${utilization}%` }}></div>
                          </div>
                        </>
                      )}
                      {marketData?.status === 'error' && (
                        <span className="text-red-400 text-xs">Error</span>
                      )}
                    </div>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="flex justify-end gap-2 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleAction('Supply', market.loanAsset)}
                        className="px-3 py-1.5 text-xs font-medium bg-brand-purple hover:bg-brand-purple-hover text-white rounded border border-transparent transition-colors"
                      >
                        Supply
                      </button>
                      <button
                        onClick={() => handleAction('Borrow', market.loanAsset)}
                        className="px-3 py-1.5 text-xs font-medium bg-transparent hover:bg-surface-border text-text-muted hover:text-white border border-surface-border rounded transition-colors"
                      >
                        Borrow
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-6 text-sm text-text-muted">
        <span>Showing 1 to {marketConfigs.length} of {marketConfigs.length} markets</span>
        <div className="flex gap-2">
          <button className="w-8 h-8 rounded border border-surface-border flex items-center justify-center hover:bg-surface-hover hover:text-white disabled:opacity-50" disabled>
            <ArrowDown className="w-4 h-4 rotate-90" />
          </button>
          <button className="w-8 h-8 rounded border border-surface-border flex items-center justify-center hover:bg-surface-hover hover:text-white">
            <ArrowDown className="w-4 h-4 -rotate-90" />
          </button>
        </div>
      </div>
    </>
  );
}
