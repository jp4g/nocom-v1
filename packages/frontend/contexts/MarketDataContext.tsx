'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, PropsWithChildren } from 'react';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { useWallet } from '@/hooks/useWallet';
import { Market, MarketDataState, AggregateMarketData } from '@/lib/types';
import { NocomLendingPoolV1Contract } from '@nocom-v1/contracts/artifacts';
import { batchSimulateUtilization } from '@/lib/contract/utilization';
import { batchSimulatePrices } from '@/lib/contract/price';
import { PriceState } from '@/hooks/usePriceOracle';

const BATCH_SIZE = 4;
const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

export interface MarketWithContract extends Market {
  contract: NocomLendingPoolV1Contract;
}

export interface MarketDataContextValue {
  markets: Map<string, MarketDataState>;
  aggregates: AggregateMarketData;
  prices: Map<string, PriceState>;
  marketConfigs: MarketWithContract[];
  refetch: () => Promise<void>;
}

const MarketDataContext = createContext<MarketDataContextValue | undefined>(undefined);

export function MarketDataProvider({ children }: PropsWithChildren) {
  const { contracts, wallet: walletHandle, activeAccount } = useWallet();

  const wallet = useMemo(() => walletHandle?.instance, [walletHandle]);
  const userAddress = useMemo(() =>
    activeAccount?.address ? AztecAddress.fromString(activeAccount.address) : undefined,
    [activeAccount?.address]
  );

  // Build market configs with contract instances
  const marketConfigs = useMemo(() => {
    if (!contracts) return [];

    return [
      {
        id: contracts.pools.usdcToZec.address.toString(),
        loanAsset: 'ZEC',
        collateralAsset: 'USDC',
        poolAddress: contracts.pools.usdcToZec.address.toString(),
        supplyApy: 4.00,
        borrowApy: 5.00,
        totalSupply: 0,
        totalBorrow: 0,
        utilization: 0,
        contract: contracts.pools.usdcToZec,
      },
      {
        id: contracts.pools.zecToUsdc.address.toString(),
        loanAsset: 'USDC',
        collateralAsset: 'ZEC',
        poolAddress: contracts.pools.zecToUsdc.address.toString(),
        supplyApy: 4.00,
        borrowApy: 5.00,
        totalSupply: 0,
        totalBorrow: 0,
        utilization: 0,
        contract: contracts.pools.zecToUsdc,
      }
    ];
  }, [contracts]);

  // Token configs for price fetching
  const tokenConfigs = useMemo(() => {
    if (!contracts) return [];
    return [
      { address: contracts.tokens.usdc.address, symbol: 'USDC' },
      { address: contracts.tokens.zec.address, symbol: 'ZEC' },
    ];
  }, [contracts]);

  const [markets, setMarkets] = useState<Map<string, MarketDataState>>(() => new Map());
  const [aggregates, setAggregates] = useState<AggregateMarketData>({ status: 'loading' });
  const [prices, setPrices] = useState<Map<string, PriceState>>(() => new Map());

  const isFetchingRef = useRef(false);
  const hasFetchedRef = useRef(false);

  const fetchMarketData = useCallback(async () => {
    if (isFetchingRef.current) {
      console.log('[MarketDataContext] Fetch already in progress, skipping');
      return;
    }

    if (!wallet || !userAddress) {
      console.log('[MarketDataContext] Wallet or address not available, skipping');
      return;
    }

    if (marketConfigs.length === 0) {
      console.log('[MarketDataContext] No market configs available, skipping');
      return;
    }

    isFetchingRef.current = true;
    console.log('[MarketDataContext] Starting market data fetch');

    // Only show loading state if we haven't fetched before
    if (!hasFetchedRef.current) {
      setMarkets(new Map(
        marketConfigs.map(config => [
          config.poolAddress,
          { status: 'loading' as const }
        ])
      ));
      setAggregates({ status: 'loading' });
      setPrices(new Map(
        tokenConfigs.map(token => [
          token.address.toString(),
          { status: 'loading' as const }
        ])
      ));
    }

    try {
      // Fetch prices
      if (contracts?.oracle && tokenConfigs.length > 0) {
        try {
          const tokenAddresses = tokenConfigs.map(t => t.address);
          const priceResults = await batchSimulatePrices(tokenAddresses, contracts.oracle, wallet, userAddress);

          setPrices(prevPrices => {
            const newPrices = new Map(prevPrices);
            priceResults.forEach((price, tokenAddress) => {
              newPrices.set(tokenAddress.toString(), {
                status: 'loaded',
                price,
              });
            });
            return newPrices;
          });
          console.log('[MarketDataContext] Prices fetched');
        } catch (error) {
          console.error('[MarketDataContext] Error fetching prices:', error);
        }
      }

      // Split markets into batches
      const batches: MarketWithContract[][] = [];
      for (let i = 0; i < marketConfigs.length; i += BATCH_SIZE) {
        batches.push(marketConfigs.slice(i, i + BATCH_SIZE));
      }

      // Process each batch
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        try {
          console.log(`[MarketDataContext] Processing batch ${i + 1}/${batches.length}`);
          const poolContracts = batch.map(config => config.contract);
          const batchResults = await batchSimulateUtilization(poolContracts, wallet, userAddress);

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
        } catch (error) {
          console.error('[MarketDataContext] Batch error:', error);
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

      // Calculate aggregates
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

      hasFetchedRef.current = true;
      console.log('[MarketDataContext] Fetch completed');
    } catch (error) {
      console.error('[MarketDataContext] Error fetching market data:', error);
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
    } finally {
      isFetchingRef.current = false;
    }
  }, [marketConfigs, tokenConfigs, contracts?.oracle, wallet, userAddress]);

  // Initial fetch and auto-refresh
  useEffect(() => {
    if (!wallet || !userAddress) {
      console.log('[MarketDataContext] Skipping fetch - wallet or address not ready');
      return;
    }

    console.log('[MarketDataContext] Setting up market data polling');
    fetchMarketData();

    const interval = setInterval(() => {
      fetchMarketData();
    }, REFRESH_INTERVAL);

    return () => {
      console.log('[MarketDataContext] Cleaning up market data polling');
      clearInterval(interval);
    };
  }, [fetchMarketData, wallet, userAddress]);

  const value = useMemo<MarketDataContextValue>(() => ({
    markets,
    aggregates,
    prices,
    marketConfigs,
    refetch: fetchMarketData,
  }), [markets, aggregates, prices, marketConfigs, fetchMarketData]);

  return (
    <MarketDataContext.Provider value={value}>
      {children}
    </MarketDataContext.Provider>
  );
}

export function useMarketDataContext() {
  const context = useContext(MarketDataContext);
  if (!context) {
    throw new Error('useMarketDataContext must be used within a MarketDataProvider');
  }
  return context;
}

export default MarketDataContext;
