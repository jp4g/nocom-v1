'use client';

import { Search } from 'lucide-react';
import { MarketType } from './MarketsContent';

interface FiltersProps {
  marketType: MarketType;
  onMarketTypeChange: (type: MarketType) => void;
}

export default function Filters({ marketType, onMarketTypeChange }: FiltersProps) {
  return (
    <div className="flex items-center gap-4 mb-6">
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          type="text"
          placeholder="Search by asset..."
          className="w-full bg-surface border border-surface-border rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-text-muted focus:outline-none focus:border-brand-purple focus:ring-1 focus:ring-brand-purple transition-all"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onMarketTypeChange('all')}
          className={`px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
            marketType === 'all'
              ? 'bg-surface border-surface-border text-white'
              : 'bg-black border-surface-border text-text-muted hover:bg-surface-hover'
          }`}
        >
          All Markets
        </button>
        <button
          onClick={() => onMarketTypeChange('debt')}
          className={`px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
            marketType === 'debt'
              ? 'bg-surface border-surface-border text-white'
              : 'bg-black border-surface-border text-text-muted hover:bg-surface-hover'
          }`}
        >
          Isolated Lending
        </button>
        <button
          onClick={() => onMarketTypeChange('stables')}
          className={`px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
            marketType === 'stables'
              ? 'bg-surface border-surface-border text-white'
              : 'bg-black border-surface-border text-text-muted hover:bg-surface-hover'
          }`}
        >
          Stablecoins
        </button>
      </div>
    </div>
  );
}
