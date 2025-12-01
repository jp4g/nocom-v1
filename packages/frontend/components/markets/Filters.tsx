import { Search } from 'lucide-react';

export default function Filters() {
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
        <button className="px-4 py-2.5 rounded-lg bg-surface border border-surface-border text-sm font-medium hover:bg-surface-hover transition-colors text-white">
          All Assets
        </button>
        <button className="px-4 py-2.5 rounded-lg bg-black border border-surface-border text-sm font-medium hover:bg-surface-hover transition-colors text-text-muted">
          Stablecoins
        </button>
      </div>
    </div>
  );
}
