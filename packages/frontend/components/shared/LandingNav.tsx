'use client';

import Link from 'next/link';
import { Layers } from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';

export default function LandingNav() {
  const { status, connect, disconnect } = useWallet();
  const isConnected = status === 'connected';

  return (
    <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-dark/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative w-6 h-6 flex items-center justify-center">
            <div className="absolute inset-0 bg-indigo-500/20 blur-md rounded-full"></div>
            <Layers className="w-5 h-5 text-indigo-400 relative z-10" />
          </div>
          <span className="text-white font-medium tracking-tight text-sm">NOCOM.FI</span>
        </div>

        <div className="hidden md:flex items-center gap-8">
          <a href="#" className="text-xs font-medium uppercase tracking-wide text-neutral-400 hover:text-white transition-colors">Markets</a>
          <a href="#" className="text-xs font-medium uppercase tracking-wide text-neutral-400 hover:text-white transition-colors">Governance</a>
          <a href="#" className="text-xs font-medium uppercase tracking-wide text-neutral-400 hover:text-white transition-colors">Developers</a>
        </div>

        <div className="flex items-center gap-4">
          <button className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-md border border-white/5 bg-white/5 hover:bg-white/10 transition-colors text-xs font-mono text-neutral-300">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
            Aztec
          </button>
          <Link
            href="/app"
            className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-md font-medium transition-all shadow-[0_0_15px_rgba(79,70,229,0.3)]"
          >
            Launch App
          </Link>
        </div>
      </div>
    </nav>
  );
}
