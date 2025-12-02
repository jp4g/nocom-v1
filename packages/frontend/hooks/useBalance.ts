'use client';

import { useState, useEffect, useCallback } from 'react';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { BaseWallet } from '@aztec/aztec.js/wallet';
import { TokenContract } from '@nocom-v1/contracts/artifacts';
import { simulationQueue } from '@/lib/utils/simulationQueue';

export interface BalanceState {
  status: 'loading' | 'loaded' | 'error';
  balance?: bigint;
  error?: string;
}

export interface UseBalanceReturn {
  balance: bigint | undefined;
  isLoading: boolean;
  error?: string;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch user's token balance.
 *
 * @param tokenContract - The token contract to check balance for
 * @param wallet - The wallet to use for balance query
 * @param userAddress - The user's address
 * @returns Object containing balance, loading state, error, and refetch function
 */
export function useBalance(
  tokenContract: TokenContract | undefined,
  wallet: BaseWallet | undefined,
  userAddress: AztecAddress | undefined
): UseBalanceReturn {
  const [state, setState] = useState<BalanceState>({
    status: 'loading',
  });

  const fetchBalance = useCallback(async () => {
    // Don't fetch if we don't have the required parameters
    if (!tokenContract || !wallet || !userAddress) {
      setState({ status: 'loading' });
      return;
    }

    setState({ status: 'loading' });

    try {
      // Queue the simulation to prevent concurrent IndexedDB access
      const availableBalance = await simulationQueue.enqueue(async () => {
        console.log('[useBalance] Starting balance simulation');
        const balance = await tokenContract.methods
          .balance_of_private(userAddress)
          .simulate({ from: userAddress });
        console.log('[useBalance] Balance simulation completed');
        return balance;
      });

      console.log("availableBalance:", availableBalance);

      setState({
        status: 'loaded',
        balance: availableBalance,
      });
    } catch (error) {
      console.error('[useBalance] Error fetching balance:', error);
      setState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to fetch balance',
      });
    }
  }, [tokenContract, wallet, userAddress]);

  // Fetch balance when dependencies change
  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  return {
    balance: state.balance,
    isLoading: state.status === 'loading',
    error: state.error,
    refetch: fetchBalance,
  };
}
