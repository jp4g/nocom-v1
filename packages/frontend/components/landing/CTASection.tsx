export default function CTASection() {
  return (
    <section className="py-24 border-t border-white/5 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-indigo-900/5 blur-[100px] pointer-events-none -z-10"></div>
      <div className="max-w-4xl mx-auto px-6 text-center">
        <h2 className="text-4xl md:text-5xl font-medium text-white tracking-tight mb-6">Liquidity has a new form.</h2>
        <p className="text-lg text-neutral-400 mb-10">Join the protocol setting the standard for on-chain privacy.</p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button className="w-full sm:w-auto px-8 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all shadow-[0_0_20px_rgba(79,70,229,0.4)]">
            Start Lending
          </button>
          <button className="w-full sm:w-auto px-8 py-3 rounded-lg border border-white/10 text-white hover:bg-white/5 transition-colors">
            View Documentation
          </button>
        </div>
      </div>
    </section>
  );
}
