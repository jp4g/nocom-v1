'use client';

import { MARKET_DATA } from '@/lib/mockData';
import { formatCurrency, getAssetColor } from '@/lib/utils';
import { ArrowDown } from 'lucide-react';

function handleAction(action: string, asset: string) {
  console.log(`${action} clicked for ${asset}`);
}

export default function MarketTable() {
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
            {MARKET_DATA.map((market) => (
              <tr key={market.id} className="group hover:bg-surface-hover/50 transition-colors border-b border-surface-border last:border-0">
                <td className="py-4 px-6">
                  <div className="flex items-center gap-3">
                    <div className="relative flex -space-x-2">
                      <div className={`w-8 h-8 rounded-full ${getAssetColor(market.loanAsset)} flex items-center justify-center text-[10px] font-bold text-black border-2 border-surface z-10`}>
                        {market.loanAsset[0]}
                      </div>
                      <div className={`w-8 h-8 rounded-full ${getAssetColor(market.collateralAsset)} flex items-center justify-center text-[10px] font-bold text-black border-2 border-surface z-0 opacity-80`}>
                        {market.collateralAsset[0]}
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
                  {formatCurrency(market.totalSupply)}
                </td>
                <td className="py-4 px-6 text-right hidden md:table-cell font-mono text-text-muted">
                  {formatCurrency(market.totalBorrow)}
                </td>
                <td className="py-4 px-6 text-right">
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs font-mono text-text-muted">{market.utilization.toFixed(1)}%</span>
                    <div className="w-24 h-1.5 bg-surface-border rounded-full overflow-hidden">
                      <div className="h-full bg-brand-purple rounded-full" style={{ width: `${market.utilization}%` }}></div>
                    </div>
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
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-6 text-sm text-text-muted">
        <span>Showing 1 to {MARKET_DATA.length} of {MARKET_DATA.length} markets</span>
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
