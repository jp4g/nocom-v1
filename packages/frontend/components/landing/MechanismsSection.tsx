import { Globe, Layers, Coins } from 'lucide-react';

export default function MechanismsSection() {
  return (
    <section className="max-w-7xl mx-auto px-6 py-24">
      <div className="grid md:grid-cols-3 gap-8">
        {/* Card 1 */}
        <div className="glass-panel p-8 rounded-xl group hover:border-indigo-500/30 transition-all duration-300">
          <div className="w-12 h-12 bg-indigo-500/10 rounded-lg flex items-center justify-center mb-6 text-indigo-400 group-hover:text-white group-hover:bg-indigo-500/20 transition-colors">
            <Globe className="w-6 h-6" />
          </div>
          <h3 className="text-xl text-white font-medium mb-3">Private Lending Across Chains</h3>
          <p className="text-sm text-neutral-400 leading-relaxed">
            Utilize Wormhole and Train Protocol bridges to bring in assets from any chain, from EVM to ZCash to Solana.
          </p>
        </div>

        {/* Card 2 */}
        <div className="glass-panel p-8 rounded-xl group hover:border-indigo-500/30 transition-all duration-300">
          <div className="w-12 h-12 bg-indigo-500/10 rounded-lg flex items-center justify-center mb-6 text-indigo-400 group-hover:text-white group-hover:bg-indigo-500/20 transition-colors">
            <Layers className="w-6 h-6" />
          </div>
          <h3 className="text-xl text-white font-medium mb-3">Isolated Debt Pools</h3>
          <p className="text-sm text-neutral-400 leading-relaxed">
            Gain lending or debt exposure to only the assets you want to interact with. Turn unproductive shielded tokens into yield-generating assets.
          </p>
        </div>

        {/* Card 3 */}
        <div className="glass-panel p-8 rounded-xl group hover:border-indigo-500/30 transition-all duration-300">
          <div className="w-12 h-12 bg-indigo-500/10 rounded-lg flex items-center justify-center mb-6 text-indigo-400 group-hover:text-white group-hover:bg-indigo-500/20 transition-colors">
            <Coins className="w-6 h-6" />
          </div>
          <h3 className="text-xl text-white font-medium mb-3">Overcollateralized Stablecoins</h3>
          <p className="text-sm text-neutral-400 leading-relaxed">
            Use assets like ZCash to privately collateralize the zUSD stablecoin, letting you leverage your shielded assets without leaking any public data past the expansion of the zUSD total supply.
          </p>
        </div>
      </div>
    </section>
  );
}
