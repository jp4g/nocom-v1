'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface WalletContextType {
  isConnected: boolean;
  address: string | null;
  toggleConnection: () => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState<string | null>(null);

  const toggleConnection = () => {
    if (isConnected) {
      setIsConnected(false);
      setAddress(null);
      console.log('Wallet disconnected');
    } else {
      setIsConnected(true);
      setAddress('0x71...3A2F');
      console.log('Wallet connected');
    }
  };

  return (
    <WalletContext.Provider value={{ isConnected, address, toggleConnection }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
