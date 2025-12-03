'use client';

import { EyeOff, ChevronDown } from 'lucide-react';
import { useState } from 'react';

export default function InteroperabilitySection() {
  const [ghostMode, setGhostMode] = useState(true);

  return (
    <section className="max-w-7xl mx-auto px-6 py-24 border-t border-white/5">
      <div className="grid lg:grid-cols-2 gap-16 items-center">
        <div>
          <h2 className="text-3xl font-medium text-white mb-8">Private Collateral</h2>

          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white/5 flex items-center justify-center border border-white/10 text-white font-mono text-xs">1</div>
              <div>
                <h4 className="text-white text-sm font-medium mb-1">Create ZK-shielded TEE Escrow</h4>
                <p className="text-xs text-neutral-500">Deploy a completely private collateral escrow shielded on Aztec that only a TEE can access.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white/5 flex items-center justify-center border border-white/10 text-white font-mono text-xs">2</div>
              <div>
                <h4 className="text-white text-sm font-medium mb-1">Collateralize Privately</h4>
                <p className="text-xs text-neutral-500">Privately collateralize in Nocom through your escrow without ANY public data leakage.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white font-mono text-xs shadow-[0_0_10px_rgba(99,102,241,0.5)]">3</div>
              <div>
                <h4 className="text-white text-sm font-medium mb-1">Borrow Anonymously</h4>
                <p className="text-xs text-neutral-500">Privately prove escrowed deposits to anonymously borrow against your funds.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Interactive Widget */}
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/20 to-transparent blur-3xl -z-10"></div>
          <div className="glass-panel rounded-2xl p-6 border border-white/10">
            <div className="flex justify-between items-center mb-8">
              <span className="text-white font-medium">Deposit</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-500">Wallet Balance:</span>
                <span className="text-xs text-white font-mono">12.45 ETH</span>
              </div>
            </div>

            {/* Asset Select */}
            <div className="bg-dark/50 border border-white/5 rounded-xl p-4 mb-4 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-900/50 flex items-center justify-center text-indigo-400 text-xs font-bold border border-indigo-500/20">Ξ</div>
                <span className="text-white font-medium">ETH</span>
                <ChevronDown className="w-4 h-4 text-neutral-500" />
              </div>
              <input type="text" defaultValue="5.00" className="bg-transparent text-right text-white font-mono text-xl focus:outline-none w-32" />
            </div>

            {/* Privacy Toggle Area */}
            <div className="bg-indigo-900/10 border border-indigo-500/20 rounded-xl p-4 mb-6">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <EyeOff className="w-4 h-4 text-indigo-400" />
                  <span className="text-sm text-indigo-100">Private Mode</span>
                </div>
                <div className="relative inline-block w-10 align-middle select-none">
                  <input
                    type="checkbox"
                    checked={ghostMode}
                    onChange={() => setGhostMode(!ghostMode)}
                    id="toggle-mode"
                    className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 border-dark appearance-none cursor-pointer transition-all duration-300 ease-in-out right-0"
                  />
                  <label htmlFor="toggle-mode" className="toggle-label block overflow-hidden h-5 rounded-full bg-indigo-500 cursor-pointer"></label>
                </div>
              </div>
              <div className="flex justify-between text-xs text-indigo-300/60 font-mono">
                <span>Anonymity Set</span>
                <span>14,203 Deposits</span>
              </div>
            </div>

            <button className="w-full py-4 rounded-xl bg-white text-dark font-semibold hover:bg-neutral-200 transition-colors">
              Supply Liquidity
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
