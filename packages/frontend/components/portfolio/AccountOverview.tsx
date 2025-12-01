'use client';

export default function AccountOverview() {
  return (
    <div className="mb-8 p-6 rounded-xl bg-gradient-to-b from-surface to-black border border-surface-border">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">

        {/* Net Worth */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-text-muted uppercase tracking-widest font-medium">Net Worth</span>
          <div className="flex items-baseline gap-3">
            <h1 className="text-4xl font-mono font-medium tracking-tight">$14,205.82</h1>
            <span className="text-sm text-green-500 font-mono bg-green-500/10 px-1.5 py-0.5 rounded border border-green-500/20">+2.4%</span>
          </div>
        </div>

        {/* Account Health Metrics */}
        <div className="flex gap-8 md:gap-12">
          <div>
            <span className="text-xs text-text-muted uppercase tracking-widest font-medium block mb-1">Net APY</span>
            <div className="text-xl font-mono text-white">3.15%</div>
          </div>
          <div>
            <span className="text-xs text-text-muted uppercase tracking-widest font-medium block mb-1">Pending Rewards</span>
            <div className="flex items-center gap-2">
              <span className="text-xl font-mono text-white">$12.40</span>
              <button className="text-[10px] uppercase tracking-wide px-2 py-0.5 bg-brand-purple text-white rounded hover:bg-brand-purple-hover transition-colors">Claim</button>
            </div>
          </div>
          <div className="min-w-[140px]">
            <div className="flex justify-between items-end mb-1">
              <span className="text-xs text-text-muted uppercase tracking-widest font-medium">Avg Health</span>
              <span className="text-lg font-mono text-green-500">2.45</span>
            </div>
            <div className="w-full h-1.5 bg-surface-border rounded-full overflow-hidden">
              {/* Health Bar: Green zone */}
              <div className="h-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 w-full relative">
                {/* Indicator */}
                <div className="absolute right-[20%] top-0 bottom-0 w-0.5 bg-white shadow-[0_0_8px_white]"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
