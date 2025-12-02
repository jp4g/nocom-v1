import { Layers } from 'lucide-react';

export default function LandingFooter() {
  return (
    <footer className="border-t border-white/5 bg-dark pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between gap-12 mb-16">
          <div className="max-w-xs">
            <div className="flex items-center gap-2 mb-6">
              <Layers className="w-5 h-5 text-indigo-400" />
              <span className="text-white font-medium tracking-tight text-sm">NOCOM.FI</span>
            </div>
            <p className="text-sm text-neutral-500 leading-relaxed">
              The decentralized, non-custodial privacy money market protocol on Aztec.
            </p>
          </div>

          <div className="flex gap-16 flex-wrap">
            <div>
              <h4 className="text-white text-xs font-semibold uppercase tracking-wider mb-4">App</h4>
              <ul className="space-y-3 text-sm text-neutral-500">
                <li><a href="#" className="hover:text-indigo-400 transition-colors">Dashboard</a></li>
                <li><a href="#" className="hover:text-indigo-400 transition-colors">Markets</a></li>
                <li><a href="#" className="hover:text-indigo-400 transition-colors">Stake GHO</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white text-xs font-semibold uppercase tracking-wider mb-4">Resources</h4>
              <ul className="space-y-3 text-sm text-neutral-500">
                <li><a href="#" className="hover:text-indigo-400 transition-colors">Documentation</a></li>
                <li><a href="#" className="hover:text-indigo-400 transition-colors">Whitepaper</a></li>
                <li><a href="#" className="hover:text-indigo-400 transition-colors">Audits</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white text-xs font-semibold uppercase tracking-wider mb-4">Community</h4>
              <ul className="space-y-3 text-sm text-neutral-500">
                <li><a href="#" className="hover:text-indigo-400 transition-colors">Discord</a></li>
                <li><a href="#" className="hover:text-indigo-400 transition-colors">Twitter</a></li>
                <li><a href="#" className="hover:text-indigo-400 transition-colors">Mirror</a></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-white/5 gap-4">
          <p className="text-xs text-neutral-600 font-mono">© 2024 Nocom.Fi</p>
          <div className="flex gap-4">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span className="text-xs text-neutral-500 font-mono">All Systems Operational</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
