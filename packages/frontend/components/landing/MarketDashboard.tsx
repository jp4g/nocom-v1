export default function MarketDashboard() {
  return (
    <div className="relative max-w-5xl mx-auto">
      {/* Abstract Blur Behind */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-3/4 bg-indigo-500/10 blur-[100px] rounded-full -z-10"></div>

      <div className="glass-panel rounded-xl overflow-hidden shadow-2xl">
        {/* Fake Browser Header */}
        <div className="border-b border-white/5 px-4 py-3 flex items-center gap-4 bg-white/[0.02]">
          <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-white/10"></div>
            <div className="w-3 h-3 rounded-full bg-white/10"></div>
            <div className="w-3 h-3 rounded-full bg-white/10"></div>
          </div>
          <div className="h-6 w-64 bg-white/5 rounded-md mx-auto hidden sm:block"></div>
        </div>

        {/* Dashboard Content */}
        <div className="p-6">
          <div className="flex justify-between items-end mb-6">
            <h3 className="text-lg text-white font-medium">Nocom Markets</h3>
            <div className="flex gap-2">
              <span className="px-3 py-1 rounded-md bg-white/5 text-xs text-white border border-white/10">All</span>
              <span className="px-3 py-1 rounded-md text-xs text-neutral-500 hover:text-white transition-colors cursor-pointer">Stablecoins</span>
              <span className="px-3 py-1 rounded-md text-xs text-neutral-500 hover:text-white transition-colors cursor-pointer">Blue Chip</span>
            </div>
          </div>

          {/* Data Table Header */}
          <div className="grid grid-cols-4 md:grid-cols-5 gap-4 px-4 py-2 border-b border-white/5 text-xs font-mono text-neutral-500 uppercase tracking-wider">
            <div className="col-span-2 md:col-span-2">Asset</div>
            <div className="text-right">Total Supplied</div>
            <div className="text-right">Deposit APY</div>
            <div className="hidden md:block text-right">Borrow APY</div>
          </div>

          {/* Rows */}
          <div className="space-y-1 mt-2">
            {/* Row 1 */}
            <div className="grid grid-cols-4 md:grid-cols-5 gap-4 px-4 py-4 rounded-lg hover:bg-white/[0.02] transition-colors items-center group cursor-pointer">
              <div className="col-span-2 md:col-span-2 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs border border-indigo-500/30">Ξ</div>
                <div>
                  <div className="text-white text-sm font-medium">Ethereum</div>
                  <div className="text-xs text-neutral-500 font-mono">ETH</div>
                </div>
              </div>
              <div className="text-right font-mono text-sm text-white">450.2K</div>
              <div className="text-right font-mono text-sm text-green-400">3.24%</div>
              <div className="hidden md:block text-right font-mono text-sm text-indigo-300">4.12%</div>
            </div>

            {/* Row 2 */}
            <div className="grid grid-cols-4 md:grid-cols-5 gap-4 px-4 py-4 rounded-lg hover:bg-white/[0.02] transition-colors items-center group cursor-pointer">
              <div className="col-span-2 md:col-span-2 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs border border-blue-500/30">$</div>
                <div>
                  <div className="text-white text-sm font-medium">USD Coin</div>
                  <div className="text-xs text-neutral-500 font-mono">USDC</div>
                </div>
              </div>
              <div className="text-right font-mono text-sm text-white">892.4M</div>
              <div className="text-right font-mono text-sm text-green-400">5.82%</div>
              <div className="hidden md:block text-right font-mono text-sm text-indigo-300">7.20%</div>
            </div>

            {/* Row 3 */}
            <div className="grid grid-cols-4 md:grid-cols-5 gap-4 px-4 py-4 rounded-lg hover:bg-white/[0.02] transition-colors items-center group cursor-pointer">
              <div className="col-span-2 md:col-span-2 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center font-bold text-xs border border-orange-500/30">₿</div>
                <div>
                  <div className="text-white text-sm font-medium">Wrapped BTC</div>
                  <div className="text-xs text-neutral-500 font-mono">WBTC</div>
                </div>
              </div>
              <div className="text-right font-mono text-sm text-white">12.5K</div>
              <div className="text-right font-mono text-sm text-green-400">1.95%</div>
              <div className="hidden md:block text-right font-mono text-sm text-indigo-300">2.85%</div>
            </div>

            {/* Row 4 */}
            <div className="grid grid-cols-4 md:grid-cols-5 gap-4 px-4 py-4 rounded-lg hover:bg-white/[0.02] transition-colors items-center group cursor-pointer">
              <div className="col-span-2 md:col-span-2 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center font-bold text-xs border border-teal-500/30">T</div>
                <div>
                  <div className="text-white text-sm font-medium">Tether</div>
                  <div className="text-xs text-neutral-500 font-mono">USDT</div>
                </div>
              </div>
              <div className="text-right font-mono text-sm text-white">410.1M</div>
              <div className="text-right font-mono text-sm text-green-400">6.10%</div>
              <div className="hidden md:block text-right font-mono text-sm text-indigo-300">7.88%</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
