import { ShieldCheck, Zap, Cpu } from 'lucide-react';

export default function MechanismsSection() {
  return (
    <section className="max-w-7xl mx-auto px-6 py-24">
      <div className="grid md:grid-cols-3 gap-8">
        {/* Card 1 */}
        <div className="glass-panel p-8 rounded-xl group hover:border-indigo-500/30 transition-all duration-300">
          <div className="w-12 h-12 bg-indigo-500/10 rounded-lg flex items-center justify-center mb-6 text-indigo-400 group-hover:text-white group-hover:bg-indigo-500/20 transition-colors">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="text-xl text-white font-medium mb-3">Shielded Pools</h3>
          <p className="text-sm text-neutral-400 leading-relaxed">
            Assets are pooled in a smart contract that utilizes zk-SNARKs to break the link between depositor and withdrawer, ensuring privacy by default.
          </p>
        </div>

        {/* Card 2 */}
        <div className="glass-panel p-8 rounded-xl group hover:border-indigo-500/30 transition-all duration-300">
          <div className="w-12 h-12 bg-indigo-500/10 rounded-lg flex items-center justify-center mb-6 text-indigo-400 group-hover:text-white group-hover:bg-indigo-500/20 transition-colors">
            <Zap className="w-6 h-6" />
          </div>
          <h3 className="text-xl text-white font-medium mb-3">Efficiency Mode</h3>
          <p className="text-sm text-neutral-400 leading-relaxed">
            Borrow correlated assets (e.g., ETH and stETH) with higher LTV ratios and lower collateralization requirements, maximizing capital efficiency.
          </p>
        </div>

        {/* Card 3 */}
        <div className="glass-panel p-8 rounded-xl group hover:border-indigo-500/30 transition-all duration-300">
          <div className="w-12 h-12 bg-indigo-500/10 rounded-lg flex items-center justify-center mb-6 text-indigo-400 group-hover:text-white group-hover:bg-indigo-500/20 transition-colors">
            <Cpu className="w-6 h-6" />
          </div>
          <h3 className="text-xl text-white font-medium mb-3">Instant Liquidations</h3>
          <p className="text-sm text-neutral-400 leading-relaxed">
            Our solver network monitors pool health block-by-block. Liquidations are processed atomically to prevent bad debt accumulation.
          </p>
        </div>
      </div>
    </section>
  );
}
