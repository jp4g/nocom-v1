'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { batchSimulatePrices } from '@/lib/contract/price';
import { MockPriceFeedContract } from '@nocom-v1/contracts/artifacts';
import { EmbeddedWallet } from '@/lib/wallet/embeddedWallet';
import { BaseWallet } from '@aztec/aztec.js/wallet';

const BATCH_SIZE = 8; // Max tokens per batch (will be 64 after oracle update)
const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

export interface TokenPrice {
  address: AztecAddress;
  symbol: string;
  price?: bigint; // Price in USD scaled by 1e4
}

export interface PriceState {
  status: 'loading' | 'loaded' | 'error';
  price?: bigint;
  error?: string;
}

export interface UsePriceOracleReturn {
  prices: Map<string, PriceState>;
  isLoading: boolean;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch and manage token prices from the price oracle.
 *
 * Features:
 * - Fetches up to 8 token prices at a time (batched simulation, will be 64 after oracle update)
 * - Progressively updates state as each batch completes
 * - Auto-refreshes every 5 minutes
 * - Returns prices as a Map keyed by token address string
 *
 * @param tokens - Array of token configurations to fetch prices for
 * @param oracleContract - The MockPriceFeedContract instance
 * @param wallet - The wallet to use for simulations
 * @param from - The address to simulate from
 * @returns Object containing prices map, loading state, and refetch function
 */
export function usePriceOracle(
  tokens: TokenPrice[],
  oracleContract: MockPriceFeedContract | undefined,
  wallet: BaseWallet | undefined,
  from: AztecAddress | undefined
): UsePriceOracleReturn {
  const [prices, setPrices] = useState<Map<string, PriceState>>(
    () => new Map(
      tokens.map(token => [
        token.address.toString(),
        { status: 'loading' as const }
      ])
    )
  );

  const [isLoading, setIsLoading] = useState(true);

  // Track if we're already fetching to prevent duplicate calls
  const isFetchingRef = useRef(false);

  const fetchPrices = useCallback(async () => {
    if (isFetchingRef.current) {
      console.log('[usePriceOracle] Skipping - already fetching');
      return;
    }

    console.log('[usePriceOracle] fetchPrices called', {
      hasOracle: !!oracleContract,
      hasWallet: !!wallet,
      hasFrom: !!from,
      tokenCount: tokens.length
    });

    // Don't fetch if we don't have the required contracts/wallet
    if (!oracleContract || !wallet || !from) {
      console.log('[usePriceOracle] Skipping fetch - missing dependencies');
      setIsLoading(false);
      return;
    }

    console.log('[usePriceOracle] Starting price fetch');
    isFetchingRef.current = true;
    setIsLoading(true);

    // Reset all prices to loading state
    setPrices(new Map(
      tokens.map(token => [
        token.address.toString(),
        { status: 'loading' as const }
      ])
    ));

    try {
      // Split tokens into batches of 8
      const tokenAddresses = tokens.map(token => token.address);
      const batches: AztecAddress[][] = [];

      for (let i = 0; i < tokenAddresses.length; i += BATCH_SIZE) {
        batches.push(tokenAddresses.slice(i, i + BATCH_SIZE));
      }

      // Process each batch
      for (const batch of batches) {
        try {
          console.log('[usePriceOracle] Processing batch of', batch.length, 'tokens');
          const batchResults = await batchSimulatePrices(batch, oracleContract, wallet, from);
          console.log("[usePriceOracle]price oracle results: ", batchResults);
          console.log('[usePriceOracle] Batch results received:', batchResults.size);

          // Update state for each token in the batch
          setPrices(prevPrices => {
            const newPrices = new Map(prevPrices);
            batchResults.forEach((price, tokenAddress) => {
              newPrices.set(tokenAddress.toString(), {
                status: 'loaded',
                price,
              });
            });
            return newPrices;
          });
        } catch (error) {
          console.error('[usePriceOracle] Batch error:', error);
          // Mark all tokens in failed batch as error
          setPrices(prevPrices => {
            const newPrices = new Map(prevPrices);
            batch.forEach(tokenAddress => {
              newPrices.set(tokenAddress.toString(), {
                status: 'error',
                error: error instanceof Error ? error.message : 'Failed to fetch price',
              });
            });
            return newPrices;
          });
        }
      }

      console.log('[usePriceOracle] Price fetch complete');
      setIsLoading(false);
    } catch (error) {
      console.error('[usePriceOracle] Error fetching prices:', error);
      setIsLoading(false);
    } finally {
      isFetchingRef.current = false;
    }
  }, [tokens, oracleContract, wallet, from]);

  // Initial fetch and setup auto-refresh
  useEffect(() => {
    fetchPrices();

    const interval = setInterval(() => {
      fetchPrices();
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [fetchPrices]);

  return {
    prices,
    isLoading,
    refetch: fetchPrices,
  };
}
