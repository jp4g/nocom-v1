import { ArrowRight } from 'lucide-react';

export default function Hero() {
  return (
    <section className="max-w-7xl mx-auto px-6 mb-24">
      <div className="flex flex-col items-center text-center mb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/20 bg-indigo-500/10 mb-6">
          <span className="text-xs font-medium text-indigo-300 tracking-wide">V3 Public Beta is Live</span>
          <ArrowRight className="w-3 h-3 text-indigo-300" />
        </div>

        <h1 className="text-5xl md:text-7xl font-medium text-white tracking-tight leading-[1.1] mb-6 max-w-4xl mx-auto">
          The Privacy Layer for <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">DeFi Lending</span>
        </h1>

        <p className="text-lg text-neutral-400 leading-relaxed mb-10 max-w-xl mx-auto">
          Supply and borrow assets with complete anonymity. Nocom.Fi utilizes zk-SNARKs to shield your balance and transaction history on-chain.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 w-full max-w-4xl border-y border-white/5 py-8">
          <div className="text-center">
            <div className="text-xs text-neutral-500 font-mono uppercase mb-1">Total Market Size</div>
            <div className="text-2xl md:text-3xl font-medium text-white font-mono tracking-tight">$842.5M</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-neutral-500 font-mono uppercase mb-1">Total Borrows</div>
            <div className="text-2xl md:text-3xl font-medium text-white font-mono tracking-tight">$310.2M</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-neutral-500 font-mono uppercase mb-1">Shielded TVL</div>
            <div className="text-2xl md:text-3xl font-medium text-indigo-400 font-mono tracking-tight">$124.8M</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-neutral-500 font-mono uppercase mb-1">Protocol Yield</div>
            <div className="text-2xl md:text-3xl font-medium text-green-400 font-mono tracking-tight">$12.4M</div>
          </div>
        </div>
      </div>
    </section>
  );
}
