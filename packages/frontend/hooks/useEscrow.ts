'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { getEscrowAddress } from '@/lib/storage/escrowStorage';
import { NocomEscrowV1Contract } from '@nocom-v1/contracts/artifacts';

export interface UseEscrowReturn {
  escrowContract: NocomEscrowV1Contract | undefined;
  isLoading: boolean;
  error?: string;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch escrow contract for a given debt pool.
 *
 * Flow:
 * 1. Check if escrow is already cached in WalletContext
 * 2. If not, check local storage for escrow address
 * 3. If found in storage, register it and cache it
 * 4. If not found, return undefined (requires deployment)
 *
 * @param debtPoolAddress - The debt pool contract address
 * @returns Object containing escrow contract, loading state, error, and refetch function
 */
export function useEscrow(
  debtPoolAddress: string | undefined
): UseEscrowReturn {
  const { escrowContracts, registerEscrow, wallet } = useWallet();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const [escrowContract, setEscrowContract] = useState<NocomEscrowV1Contract | undefined>(undefined);

  const fetchEscrow = useCallback(async () => {
    if (!debtPoolAddress) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(undefined);

    try {
      console.log('[useEscrow] Checking for escrow contract:', debtPoolAddress);

      // 1. First check if already cached in WalletContext
      const cachedEscrow = escrowContracts.get(debtPoolAddress);
      if (cachedEscrow) {
        console.log('[useEscrow] Found cached escrow contract');
        setEscrowContract(cachedEscrow);
        setIsLoading(false);
        return;
      }

      // 2. Check local storage for escrow address
      const storedEscrowAddress = getEscrowAddress(debtPoolAddress);
      if (!storedEscrowAddress) {
        console.log('[useEscrow] No escrow found - deployment required');
        setEscrowContract(undefined);
        setIsLoading(false);
        return;
      }

      console.log('[useEscrow] Found escrow address in storage:', storedEscrowAddress);

      // 3. Register the escrow contract and cache it
      if (!wallet) {
        throw new Error('Wallet not connected');
      }

      const registeredEscrow = await registerEscrow(debtPoolAddress, storedEscrowAddress);
      setEscrowContract(registeredEscrow);
      console.log('[useEscrow] Escrow contract registered and cached');

    } catch (err) {
      console.error('[useEscrow] Error fetching escrow:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch escrow');
      setEscrowContract(undefined);
    } finally {
      setIsLoading(false);
    }
  }, [debtPoolAddress, escrowContracts, registerEscrow, wallet]);

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
