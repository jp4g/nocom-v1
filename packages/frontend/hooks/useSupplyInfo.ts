'use client';

import { useState, useEffect, useCallback } from 'react';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { BaseWallet } from '@aztec/aztec.js/wallet';
import { TokenContract } from '@nocom-v1/contracts/artifacts';

export interface SupplyInfoState {
  status: 'loading' | 'loaded' | 'error';
  balance?: bigint;
  error?: string;
}

export interface UseSupplyInfoReturn {
  balance: bigint | undefined;
  isLoading: boolean;
  error?: string;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch user's token balance for supply operations.
 *
 * @param tokenAddress - The address of the token to check balance for
 * @param wallet - The wallet to use for balance query
 * @param userAddress - The user's address
 * @returns Object containing balance, loading state, error, and refetch function
 */
export function useSupplyInfo(
  tokenContract: TokenContract | undefined,
  wallet: BaseWallet | undefined,
  userAddress: AztecAddress | undefined
): UseSupplyInfoReturn {
  const [state, setState] = useState<SupplyInfoState>({
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
      const availableBalance = await tokenContract.methods
        .balance_of_private(userAddress)
        .simulate({ from: userAddress });

      console.log("availableBalance:", availableBalance);

      setState({
        status: 'loaded',
        balance: availableBalance,
      });
    } catch (error) {
      console.error('[useSupplyInfo] Error fetching balance:', error);
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
