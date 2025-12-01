'use client';

import { useState } from 'react';
import { Layers } from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';
import WalletModal from '@/components/wallet/WalletModal';

export default function MarketsNav() {
  const { status, activeAccount } = useWallet();
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';

  return (
    <nav className="fixed top-0 w-full z-50 glass-header h-16">
      <div className="max-w-[1400px] mx-auto px-6 h-full flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-purple rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(91,30,138,0.5)]">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <span className="font-semibold text-lg tracking-tight">Ghost Protocol</span>
        </div>

        {/* Nav Links */}
        <div className="hidden md:flex items-center gap-8">
          <a href="#" className="text-sm font-medium text-white border-b-2 border-brand-purple pb-0.5">Markets</a>
          <a href="#" className="text-sm font-medium text-text-muted hover:text-white transition-colors">Portfolio</a>
          <a href="#" className="text-sm font-medium text-text-muted hover:text-white transition-colors">Governance</a>
        </div>

        {/* Connect Button */}
        <button
          onClick={() => setIsWalletModalOpen(true)}
          className={`group relative px-4 py-2 rounded-md bg-surface border transition-all duration-300 ${
            isConnected
              ? 'border-brand-purple/50 bg-brand-purple/10 hover:bg-brand-purple/20'
              : 'border-surface-border hover:border-brand-purple hover:bg-surface-hover'
          }`}
        >
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full transition-colors ${
              isConnected ? 'bg-green-500' : isConnecting ? 'bg-yellow-500 animate-pulse' : 'bg-text-muted group-hover:bg-brand-purple'
            }`}></div>
            <span className={`text-sm font-medium text-white ${isConnected || isConnecting ? 'font-mono' : ''}`}>
              {isConnecting ? 'Connecting...' : isConnected && activeAccount ? `${activeAccount.label} · ${activeAccount.address.slice(0, 6)}…${activeAccount.address.slice(-4)}` : 'Connect Wallet'}
            </span>
          </div>
        </button>

        <WalletModal
          open={isWalletModalOpen}
          onClose={() => setIsWalletModalOpen(false)}
        />
      </div>
    </nav>
  );
}
