'use client';

import { MARKET_DATA } from '@/lib/mockData';
import { formatCurrency } from '@/lib/utils';

export default function StatsBar() {
  const totalSupplied = MARKET_DATA.reduce((acc, curr) => acc + curr.totalSupply, 0);
  const totalBorrowed = MARKET_DATA.reduce((acc, curr) => acc + curr.totalBorrow, 0);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 p-6 rounded-xl bg-surface border border-surface-border">
      <div>
        <div className="text-xs text-text-muted uppercase tracking-wider mb-1 font-medium">Total Market Size</div>
        <div className="text-2xl font-mono font-medium text-white">{formatCurrency(totalSupplied)}</div>
      </div>
      <div>
        <div className="text-xs text-text-muted uppercase tracking-wider mb-1 font-medium">Total Borrows</div>
        <div className="text-2xl font-mono font-medium text-white">{formatCurrency(totalBorrowed)}</div>
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
