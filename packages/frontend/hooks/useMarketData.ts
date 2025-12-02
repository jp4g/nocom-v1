'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { BaseWallet } from '@aztec/aztec.js/wallet';
import { Market, MarketDataState, AggregateMarketData } from '@/lib/types';
import { NocomLendingPoolV1Contract } from '@nocom-v1/contracts/artifacts';
import { batchSimulateUtilization } from '@/lib/contract/utilization';

const BATCH_SIZE = 4;
const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

export interface MarketWithContract extends Market {
  contract: NocomLendingPoolV1Contract;
}

export interface UseMarketDataReturn {
  markets: Map<string, MarketDataState>;
  aggregates: AggregateMarketData;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch and manage market utilization data with batched simulation.
 *
 * Features:
 * - Fetches up to 4 markets at a time (batched simulation)
 * - Progressively updates state as each batch completes
 * - Auto-refreshes every 5 minutes
 * - Calculates aggregate totals after all markets load
 *
 * @param marketConfigs - Array of market configurations with pool contracts
 * @param wallet - The wallet to use for simulations
 * @param from - The address to simulate from
 * @returns Object containing markets map, aggregates, and refetch function
 */
export function useMarketData(
  marketConfigs: MarketWithContract[],
  wallet: BaseWallet | undefined,
  from: AztecAddress | undefined
): UseMarketDataReturn {
  const [markets, setMarkets] = useState<Map<string, MarketDataState>>(
    () => {
      const initialMap = new Map(
        marketConfigs.map(config => [
          config.poolAddress,
          { status: 'loading' as const }
        ])
      );
      return initialMap;
    }
  );

  const [aggregates, setAggregates] = useState<AggregateMarketData>({
    status: 'loading',
  });

  // Track if we're already fetching to prevent duplicate calls
  const isFetchingRef = useRef(false);

  const fetchMarketData = useCallback(async () => {
    if (isFetchingRef.current) {
      console.log('[useMarketData] Fetch already in progress, skipping');
      return;
    }

    // Don't fetch if we don't have the required wallet/address
    if (!wallet || !from) {
      console.log('[useMarketData] Wallet or address not available, skipping');
      return;
    }

    isFetchingRef.current = true;
    console.log('[useMarketData] Starting market data fetch');

    // Reset all markets to loading state
    setMarkets(new Map(
      marketConfigs.map(config => [
        config.poolAddress,
        { status: 'loading' as const }
      ])
    ));

    setAggregates({ status: 'loading' });

    try {
      // Split markets into batches of 4
      const batches: MarketWithContract[][] = [];

      for (let i = 0; i < marketConfigs.length; i += BATCH_SIZE) {
        batches.push(marketConfigs.slice(i, i + BATCH_SIZE));
      }

      // Process each batch sequentially with small delay to avoid IndexedDB contention
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        try {
          console.log(`[useMarketData] Processing batch ${i + 1}/${batches.length}`);
          const poolContracts = batch.map(config => config.contract);
          const batchResults = await batchSimulateUtilization(poolContracts, wallet, from);

          // Update state for each market in the batch
          setMarkets(prevMarkets => {
            const newMarkets = new Map(prevMarkets);
            batchResults.forEach((data, poolAddress) => {
              const key = poolAddress.toString();
              newMarkets.set(key, {
                status: 'loaded',
                data,
              });
            });
            return newMarkets;
          });

          // Add small delay between batches to reduce IndexedDB transaction contention
          if (i < batches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (error) {
          console.error('[useMarketData] Batch error:', error);
          // Mark all markets in failed batch as error
          setMarkets(prevMarkets => {
            const newMarkets = new Map(prevMarkets);
            batch.forEach(config => {
              newMarkets.set(config.poolAddress, {
                status: 'error',
                error: error instanceof Error ? error.message : 'Failed to fetch data',
              });
            });
            return newMarkets;
          });
        }
      }

      // Calculate aggregates after all batches complete
      setMarkets(currentMarkets => {
        let totalSupplied = 0n;
        let totalBorrowed = 0n;
        let allLoaded = true;

        currentMarkets.forEach(marketState => {
          if (marketState.status === 'loaded' && marketState.data) {
            totalSupplied += marketState.data.totalSupplied;
            totalBorrowed += marketState.data.totalBorrowed;
          } else if (marketState.status === 'loading') {
            allLoaded = false;
          }
        });

        if (allLoaded) {
          const utilization = totalSupplied === 0n
            ? 0
            : Number((totalBorrowed * 100n) / totalSupplied);

          setAggregates({
            status: 'loaded',
            totalSupplied,
            totalBorrowed,
            utilization,
          });
        }

        return currentMarkets;
      });
    } catch (error) {
      console.error('[useMarketData] Error fetching market data:', error);
      // Set all markets to error state if top-level error
      setMarkets(prevMarkets => {
        const newMarkets = new Map(prevMarkets);
        marketConfigs.forEach(config => {
          if (newMarkets.get(config.poolAddress)?.status === 'loading') {
            newMarkets.set(config.poolAddress, {
              status: 'error',
              error: error instanceof Error ? error.message : 'Failed to fetch data',
            });
          }
        });
        return newMarkets;
      });
      setAggregates({ status: 'loading' });
    } finally {
      isFetchingRef.current = false;
      console.log('[useMarketData] Fetch completed');
    }
  }, [marketConfigs, wallet, from]);

  // Initial fetch and setup auto-refresh
  useEffect(() => {
    // Only fetch if we have wallet and address
    if (!wallet || !from) {
      console.log('[useMarketData] Skipping initial fetch - wallet or address not ready');
      return;
    }

    console.log('[useMarketData] Setting up market data polling');
    fetchMarketData();

    const interval = setInterval(() => {
      fetchMarketData();
    }, REFRESH_INTERVAL);

    return () => {
      console.log('[useMarketData] Cleaning up market data polling');
      clearInterval(interval);
    };
  }, [fetchMarketData, wallet, from]);

  return {
    markets,
    aggregates,
    refetch: fetchMarketData,
  };
}
