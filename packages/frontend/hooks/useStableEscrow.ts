'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { getStableEscrowData } from '@/lib/storage/stableEscrowStorage';
import { NocomStableEscrowV1Contract } from '@nocom-v1/contracts/artifacts';

export interface UseStableEscrowReturn {
  escrowContract: NocomStableEscrowV1Contract | undefined;
  isLoading: boolean;
  error?: string;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch stable escrow contract for a given stable pool.
 *
 * Flow:
 * 1. Check if escrow is already cached in WalletContext
 * 2. If not, check local storage for escrow address (per-user)
 * 3. If found in storage, register it and cache it
 * 4. If not found, return undefined (requires deployment)
 *
 * @param stablePoolAddress - The stable pool contract address
 * @returns Object containing escrow contract, loading state, error, and refetch function
 */
export function useStableEscrow(
  stablePoolAddress: string | undefined
): UseStableEscrowReturn {
  const { stableEscrowContracts, registerStableEscrow, wallet, activeAccount } = useWallet();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const [escrowContract, setEscrowContract] = useState<NocomStableEscrowV1Contract | undefined>(undefined);

  const fetchEscrow = useCallback(async () => {
    if (!stablePoolAddress || !activeAccount?.address) {
      setIsLoading(false);
      setEscrowContract(undefined);
      return;
    }

    setIsLoading(true);
    setError(undefined);

    try {
      console.log('[useStableEscrow] Checking for stable escrow contract:', { stablePoolAddress, userAddress: activeAccount.address });

      // 1. First check if already cached in WalletContext
      const cachedEscrow = stableEscrowContracts.get(stablePoolAddress);
      if (cachedEscrow) {
        console.log('[useStableEscrow] Found cached stable escrow contract');
        setEscrowContract(cachedEscrow);
        setIsLoading(false);
        return;
      }

      // 2. Check local storage for escrow data (per-user)
      const storedEscrowData = getStableEscrowData(activeAccount.address, stablePoolAddress);
      if (!storedEscrowData) {
        console.log('[useStableEscrow] No stable escrow found - deployment required');
        setEscrowContract(undefined);
        setIsLoading(false);
        return;
      }

      console.log('[useStableEscrow] Found stable escrow data in storage:', storedEscrowData.escrowAddress);

      // 3. Register the escrow contract with its secret key, instance and cache it
      if (!wallet) {
        throw new Error('Wallet not connected');
      }

      const registeredEscrow = await registerStableEscrow(stablePoolAddress, storedEscrowData.escrowAddress, storedEscrowData.secretKey, storedEscrowData.instance);
      setEscrowContract(registeredEscrow);
      console.log('[useStableEscrow] Stable escrow contract registered and cached');

    } catch (err) {
      console.error('[useStableEscrow] Error fetching stable escrow:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch stable escrow');
      setEscrowContract(undefined);
    } finally {
      setIsLoading(false);
    }
  }, [stablePoolAddress, activeAccount?.address, stableEscrowContracts, registerStableEscrow, wallet]);

  useEffect(() => {
    fetchEscrow();
  }, [fetchEscrow]);

  return {
    escrowContract,
    isLoading,
    error,
    refetch: fetchEscrow,
  };
}
