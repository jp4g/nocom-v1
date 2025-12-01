'use client';

import { useEffect } from 'react';

interface Supply {
  asset: string;
  symbol: string;
  balance: number;
  balanceCrypto: number;
  apy: number;
}

const USER_SUPPLIES: Supply[] = [
  { asset: 'USDC', symbol: 'USDC', balance: 14500.50, balanceCrypto: 14500.50, apy: 4.82 },
  { asset: 'Wrapped Eth', symbol: 'WETH', balance: 9999.50, balanceCrypto: 3.85, apy: 2.95 }
];

const formatUSD = (value: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
};

const formatCrypto = (value: number) => {
  return value.toLocaleString('en-US', { maximumFractionDigits: 4 });
};

const getAssetColor = (symbol: string) => {
  const colors: Record<string, string> = {
    'USDC': 'bg-blue-500',
    'WETH': 'bg-purple-500',
    'WBTC': 'bg-orange-500',
    'DAI': 'bg-yellow-500',
    'USDT': 'bg-teal-500',
    'ARB': 'bg-blue-400'
  };
  return colors[symbol] || 'bg-gray-500';
};

export default function SuppliesTable() {
  return (
    <section className="bg-surface rounded-xl border border-surface-border flex flex-col overflow-hidden h-full">
      <div className="p-5 border-b border-surface-border flex justify-between items-center bg-surface-card">
        <h2 className="text-lg font-medium tracking-tight">Your Supplies</h2>
        <span className="text-xs font-mono text-text-muted">Balance: $24,500.00</span>
      </div>

      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-surface-hover/30">
            <tr className="text-[11px] text-text-muted uppercase tracking-wider border-b border-surface-border">
              <th className="py-3 px-5 font-medium">Asset</th>
              <th className="py-3 px-5 font-medium text-right">Balance</th>
              <th className="py-3 px-5 font-medium text-right">APY</th>
              <th className="py-3 px-5 font-medium text-right">Manage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border text-sm">
            {USER_SUPPLIES.map((item) => (
              <tr key={item.symbol} className="group hover:bg-surface-hover transition-colors border-b border-surface-border last:border-0">
                <td className="py-4 px-5">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full ${getAssetColor(item.symbol)} flex items-center justify-center text-[10px] font-bold text-black border border-white/10`}>
                      {item.symbol[0]}
                    </div>
                    <div>
                      <div className="font-medium text-white text-sm">{item.symbol}</div>
                    </div>
                  </div>
                </td>
                <td className="py-4 px-5 text-right">
                  <div className="font-mono text-white">{formatCrypto(item.balanceCrypto)}</div>
                  <div className="text-xs text-text-muted font-mono">{formatUSD(item.balance)}</div>
                </td>
                <td className="py-4 px-5 text-right">
                  <span className="inline-flex items-center text-xs font-mono font-medium text-green-400">
                    {item.apy}%
                  </span>
                </td>
                <td className="py-4 px-5 text-right">
                  <div className="flex justify-end gap-2">
                    <button className="px-3 py-1.5 text-xs font-medium bg-surface border border-surface-border hover:bg-surface-hover hover:text-white text-text-muted rounded transition-colors">
                      Withdraw
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Empty State (Hidden when there are supplies) */}
      {USER_SUPPLIES.length === 0 && (
        <div className="py-12 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-surface-border flex items-center justify-center mb-3">
            <svg className="w-6 h-6 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
          </div>
          <p className="text-text-muted text-sm">Nothing supplied yet</p>
        </div>
      )}
    </section>
  );
}
