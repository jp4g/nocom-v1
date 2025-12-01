'use client';

import { Info } from 'lucide-react';

interface Borrow {
  asset: string;
  symbol: string;
  debt: number;
  debtCrypto: number;
  apy: number;
  healthFactor: number;
}

const USER_BORROWS: Borrow[] = [
  { asset: 'Dai Stablecoin', symbol: 'DAI', debt: 8200.00, debtCrypto: 8200.00, apy: 6.90, healthFactor: 2.15 },
  { asset: 'Wrapped BTC', symbol: 'WBTC', debt: 2094.18, debtCrypto: 0.045, apy: 1.25, healthFactor: 3.42 }
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

const getHealthColor = (hf: number) => {
  if (hf < 1.1) return 'text-red-500';
  if (hf < 1.5) return 'text-yellow-500';
  return 'text-green-500';
};

export default function BorrowsTable() {
  return (
    <section className="bg-surface rounded-xl border border-surface-border flex flex-col overflow-hidden h-full">
      <div className="p-5 border-b border-surface-border flex justify-between items-center bg-surface-card">
        <h2 className="text-lg font-medium tracking-tight">Your Borrows</h2>
        <span className="text-xs font-mono text-text-muted">Debt: $10,294.18</span>
      </div>

      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-surface-hover/30">
            <tr className="text-[11px] text-text-muted uppercase tracking-wider border-b border-surface-border">
              <th className="py-3 px-5 font-medium">Asset</th>
              <th className="py-3 px-5 font-medium text-right">Debt</th>
              <th className="py-3 px-5 font-medium text-right">APY</th>
              <th className="py-3 px-5 font-medium text-right">Health Factor</th>
              <th className="py-3 px-5 font-medium text-right">Manage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border text-sm">
            {USER_BORROWS.map((item) => (
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
                  <div className="font-mono text-white">{formatCrypto(item.debtCrypto)}</div>
                  <div className="text-xs text-text-muted font-mono">{formatUSD(item.debt)}</div>
                </td>
                <td className="py-4 px-5 text-right">
                  <span className="inline-flex items-center text-xs font-mono font-medium text-text-muted">
                    {item.apy}%
                  </span>
                </td>
                <td className="py-4 px-5 text-right">
                  <span className={`text-sm font-mono font-medium ${getHealthColor(item.healthFactor)}`}>
                    {item.healthFactor.toFixed(2)}
                  </span>
                </td>
                <td className="py-4 px-5 text-right">
                  <button className="px-3 py-1.5 text-xs font-medium bg-surface border border-surface-border hover:bg-surface-hover hover:text-white text-text-muted rounded transition-colors">
                    Repay
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Alert Footer */}
      <div className="p-4 bg-blue-900/10 border-t border-surface-border flex items-start gap-3 mt-auto">
        <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-200/80 leading-relaxed">Liquidation occurs when your Health Factor drops below 1.0.</p>
      </div>
    </section>
  );
}
