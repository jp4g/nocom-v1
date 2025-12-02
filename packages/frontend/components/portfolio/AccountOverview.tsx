'use client';

import { Loader2 } from 'lucide-react';
import { PortfolioState, LOAN_APY, DEBT_APY } from '@/hooks/usePortfolio';
import { formatCurrency } from '@/lib/utils';

interface AccountOverviewProps {
  state: PortfolioState;
  netWorthUSD: number;
  avgHealthFactor: number;
  totalLoansUSD: number;
  totalDebtUSD: number;
}

const getHealthColor = (hf: number) => {
  if (hf < 1.1) return 'text-red-500';
  if (hf < 1.5) return 'text-yellow-500';
  return 'text-green-500';
};

// Calculate the health bar indicator position (0-100%)
// Health factor 1.0 = 0%, 3.0+ = 100%
const getHealthBarPosition = (hf: number) => {
  const minHF = 1.0;
  const maxHF = 3.0;
  const clamped = Math.max(minHF, Math.min(maxHF, hf));
  return ((clamped - minHF) / (maxHF - minHF)) * 100;
};

export default function AccountOverview({ state, netWorthUSD, avgHealthFactor, totalLoansUSD, totalDebtUSD }: AccountOverviewProps) {
  // Calculate net APY: (loans * loanAPY - debt * debtAPY) / netWorth
  const netApy = netWorthUSD !== 0
    ? ((totalLoansUSD * LOAN_APY - totalDebtUSD * DEBT_APY) / netWorthUSD)
    : 0;

  const isLoading = state.status === 'loading';
  const healthIndicatorPosition = 100 - getHealthBarPosition(avgHealthFactor);

  return (
    <div className="mb-8 p-6 rounded-xl bg-gradient-to-b from-surface to-black border border-surface-border">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">

        {/* Net Worth */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-text-muted uppercase tracking-widest font-medium">Net Worth</span>
          <div className="flex items-baseline gap-3">
            {isLoading ? (
              <Loader2 className="w-8 h-8 animate-spin text-text-muted" />
            ) : (
              <>
                <h1 className="text-4xl font-mono font-medium tracking-tight">{formatCurrency(netWorthUSD)}</h1>
              </>
            )}
          </div>
        </div>

        {/* Account Health Metrics */}
        <div className="flex gap-8 md:gap-12">
          <div>
            <span className="text-xs text-text-muted uppercase tracking-widest font-medium block mb-1">Net APY</span>
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
            ) : (
              <div className={`text-xl font-mono ${netApy >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {netApy >= 0 ? '+' : ''}{netApy.toFixed(2)}%
              </div>
            )}
          </div>
          <div>
            <span className="text-xs text-text-muted uppercase tracking-widest font-medium block mb-1">Pending Rewards</span>
            <div className="flex items-center gap-2">
              <span className="text-xl font-mono text-white">$0.00</span>
              <button className="text-[10px] uppercase tracking-wide px-2 py-0.5 bg-brand-purple text-white rounded hover:bg-brand-purple-hover transition-colors disabled:opacity-50" disabled>Claim</button>
            </div>
          </div>
          <div className="min-w-[140px]">
            <div className="flex justify-between items-end mb-1">
              <span className="text-xs text-text-muted uppercase tracking-widest font-medium">Avg Health</span>
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-text-muted" />
              ) : (
                <span className={`text-lg font-mono ${getHealthColor(avgHealthFactor)}`}>
                  {avgHealthFactor.toFixed(2)}
                </span>
              )}
            </div>
            <div className="w-full h-1.5 bg-surface-border rounded-full overflow-hidden">
              {/* Health Bar: Green zone */}
              <div className="h-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 w-full relative">
                {/* Indicator */}
                {!isLoading && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_8px_white]"
                    style={{ right: `${healthIndicatorPosition}%` }}
                  ></div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
