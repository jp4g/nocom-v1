'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, PropsWithChildren } from 'react';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { type AztecNode } from '@aztec/aztec.js/node';
import { useWallet } from '@/hooks/useWallet';
import { Market, MarketDataState, AggregateMarketData } from '@/lib/types';
import { NocomLendingPoolV1Contract, NocomEscrowV1Contract } from '@nocom-v1/contracts/artifacts';
import { batchSimulateUtilization } from '@/lib/contract/utilization';
import { batchSimulatePrices } from '@/lib/contract/price';
import { batchSimulateDebtPosition } from '@/lib/contract/position';
import { EPOCH_LENGTH } from '@nocom-v1/contracts/constants';
import { DebtPosition as ContractDebtPosition } from '@nocom-v1/contracts/types';

const BATCH_SIZE = 4;
const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

// APY constants
export const LOAN_APY = 4.00;
export const DEBT_APY = 5.00;

// Helper to get current epoch from the node
async function getCurrentEpoch(node: AztecNode): Promise<bigint> {
  const block = await node.getBlock('latest');
  if (!block) throw new Error('Failed to get latest block');
  return BigInt(Math.ceil(Number(block.timestamp) / EPOCH_LENGTH));
}

// ==================== Price Types ====================
export interface PriceState {
  status: 'loading' | 'loaded' | 'error';
  price?: bigint;
  error?: string;
}

// ==================== Market Types ====================
export interface MarketWithContract extends Market {
  contract: NocomLendingPoolV1Contract;
}

// ==================== Portfolio Types ====================
export interface PortfolioPosition {
  symbol: string;
  loanAsset: string;
  collateralAsset: string;
  balance: bigint;
  balanceUSD: number;
  poolAddress: string;
}

export interface LoanPosition extends PortfolioPosition {
  apy: number;
}

export interface CollateralPosition extends PortfolioPosition {
  collateralFactor: number;
}

export interface DebtPosition extends PortfolioPosition {
  apy: number;
  healthFactor: number;
}

export interface PortfolioState {
  status: 'loading' | 'loaded' | 'error';
  error?: string;
}

export interface PortfolioData {
  loans: LoanPosition[];
  collateral: CollateralPosition[];
  debt: DebtPosition[];
  totalLoansUSD: number;
  totalCollateralUSD: number;
  totalDebtUSD: number;
  netWorthUSD: number;
  avgHealthFactor: number;
}

// ==================== Context Value ====================
export interface DataContextValue {
  // Prices
  prices: Map<string, PriceState>;
  pricesLoaded: boolean;

  // Market data
  markets: Map<string, MarketDataState>;
  aggregates: AggregateMarketData;
  marketConfigs: MarketWithContract[];

  // Portfolio data
  portfolioState: PortfolioState;
  portfolioData: PortfolioData;

  // Actions
  refetchPrices: () => Promise<void>;
  refetchMarkets: () => Promise<void>;
  refetchPortfolio: () => Promise<void>;
}

const defaultPortfolioData: PortfolioData = {
  loans: [],
  collateral: [],
  debt: [],
  totalLoansUSD: 0,
  totalCollateralUSD: 0,
  totalDebtUSD: 0,
  netWorthUSD: 0,
  avgHealthFactor: 1,
};

const DataContext = createContext<DataContextValue | undefined>(undefined);

export function DataProvider({ children }: PropsWithChildren) {
  const { contracts, wallet: walletHandle, activeAccount, node, escrowContracts } = useWallet();

  const wallet = useMemo(() => walletHandle?.instance, [walletHandle]);
  const userAddress = useMemo(() =>
    activeAccount?.address ? AztecAddress.fromString(activeAccount.address) : undefined,
    [activeAccount?.address]
  );

  // ==================== Prices State ====================
  const [prices, setPrices] = useState<Map<string, PriceState>>(() => new Map());
  const [pricesLoaded, setPricesLoaded] = useState(false);
  const isFetchingPricesRef = useRef(false);

  // ==================== Market State ====================
  const [markets, setMarkets] = useState<Map<string, MarketDataState>>(() => new Map());
  const [aggregates, setAggregates] = useState<AggregateMarketData>({ status: 'loading' });
  const isFetchingMarketsRef = useRef(false);
  const hasMarketsFetchedRef = useRef(false);

  // ==================== Portfolio State ====================
  const [portfolioState, setPortfolioState] = useState<PortfolioState>({ status: 'loading' });
  const [portfolioData, setPortfolioData] = useState<PortfolioData>(defaultPortfolioData);
  const isFetchingPortfolioRef = useRef(false);
  const hasPortfolioFetchedRef = useRef(false);

  // ==================== Configs ====================
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

  const tokenConfigs = useMemo(() => {
    if (!contracts) return [];
    return [
      { address: contracts.tokens.usdc.address, symbol: 'USDC' },
      { address: contracts.tokens.zec.address, symbol: 'ZEC' },
    ];
  }, [contracts]);

  // ==================== Price Fetching ====================
  const fetchPrices = useCallback(async () => {
    if (isFetchingPricesRef.current) {
      console.log('[DataContext] Price fetch already in progress, skipping');
      return;
    }

    if (!wallet || !userAddress || !contracts?.oracle || tokenConfigs.length === 0) {
      console.log('[DataContext] Cannot fetch prices - missing dependencies');
      return;
    }

    isFetchingPricesRef.current = true;
    console.log('[DataContext] Fetching prices...');

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

      setPricesLoaded(true);
      console.log('[DataContext] Prices fetched successfully');
    } catch (error) {
      console.error('[DataContext] Error fetching prices:', error);
      setPrices(prevPrices => {
        const newPrices = new Map(prevPrices);
        tokenConfigs.forEach(token => {
          newPrices.set(token.address.toString(), {
            status: 'error',
            error: error instanceof Error ? error.message : 'Failed to fetch price',
          });
        });
        return newPrices;
      });
    } finally {
      isFetchingPricesRef.current = false;
    }
  }, [wallet, userAddress, contracts?.oracle, tokenConfigs]);

  // Helper to ensure prices are loaded before proceeding
  const ensurePricesLoaded = useCallback(async () => {
    if (pricesLoaded) {
      return;
    }
    await fetchPrices();
  }, [pricesLoaded, fetchPrices]);

  // ==================== Market Fetching ====================
  const fetchMarkets = useCallback(async () => {
    if (isFetchingMarketsRef.current) {
      console.log('[DataContext] Market fetch already in progress, skipping');
      return;
    }

    if (!wallet || !userAddress || marketConfigs.length === 0) {
      console.log('[DataContext] Cannot fetch markets - missing dependencies');
      return;
    }

    // Ensure prices are loaded first
    await ensurePricesLoaded();

    isFetchingMarketsRef.current = true;
    console.log('[DataContext] Fetching market data...');

    // Only show loading state if we haven't fetched before
    if (!hasMarketsFetchedRef.current) {
      setMarkets(new Map(
        marketConfigs.map(config => [
          config.poolAddress,
          { status: 'loading' as const }
        ])
      ));
      setAggregates({ status: 'loading' });
    }

    try {
      // Split markets into batches
      const batches: MarketWithContract[][] = [];
      for (let i = 0; i < marketConfigs.length; i += BATCH_SIZE) {
        batches.push(marketConfigs.slice(i, i + BATCH_SIZE));
      }

      // Process each batch
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        try {
          console.log(`[DataContext] Processing market batch ${i + 1}/${batches.length}`);
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
          console.error('[DataContext] Market batch error:', error);
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

      hasMarketsFetchedRef.current = true;
      console.log('[DataContext] Market fetch completed');
    } catch (error) {
      console.error('[DataContext] Error fetching markets:', error);
    } finally {
      isFetchingMarketsRef.current = false;
    }
  }, [marketConfigs, wallet, userAddress, ensurePricesLoaded]);

  // ==================== Portfolio Fetching ====================
  const fetchPortfolio = useCallback(async () => {
    if (isFetchingPortfolioRef.current) {
      console.log('[DataContext] Portfolio fetch already in progress, skipping');
      return;
    }

    if (!wallet || !userAddress || !node || marketConfigs.length === 0) {
      console.log('[DataContext] Cannot fetch portfolio - missing dependencies');
      return;
    }

    // Ensure prices are loaded first
    await ensurePricesLoaded();

    isFetchingPortfolioRef.current = true;

    // Only show loading state if we haven't fetched before
    if (!hasPortfolioFetchedRef.current) {
      setPortfolioState({ status: 'loading' });
    }

    try {
      console.log('[DataContext] Fetching portfolio data...');

      // Get current epoch from the node
      const currentEpoch = await getCurrentEpoch(node);
      console.log('[DataContext] Current epoch:', currentEpoch.toString());

      // Build arrays for markets that have escrow contracts registered
      const marketsWithEscrows: NocomLendingPoolV1Contract[] = [];
      const escrowAddresses: AztecAddress[] = [];
      const marketConfigsWithEscrows: MarketWithContract[] = [];

      for (const marketConfig of marketConfigs) {
        const escrowContract = escrowContracts.get(marketConfig.poolAddress);
        if (escrowContract) {
          marketsWithEscrows.push(marketConfig.contract);
          escrowAddresses.push(escrowContract.address);
          marketConfigsWithEscrows.push(marketConfig);
        }
      }

      console.log('[DataContext] Found', marketsWithEscrows.length, 'markets with escrows');

      // Initialize empty arrays for positions
      const collateralPositions: CollateralPosition[] = [];
      const debtPositions: DebtPosition[] = [];

      // Fetch debt positions if we have any markets with escrows
      if (marketsWithEscrows.length > 0) {
        const positionResults = await batchSimulateDebtPosition(
          marketsWithEscrows,
          escrowAddresses,
          wallet,
          userAddress,
          currentEpoch
        );

        // Map contract positions to UI positions
        positionResults.forEach((contractPosition, poolAddress) => {
          const marketConfig = marketConfigsWithEscrows.find(
            m => m.poolAddress === poolAddress.toString()
          );
          if (!marketConfig) return;

          // Get the price for the collateral asset
          const collateralTokenAddress = contracts?.tokens[
            marketConfig.collateralAsset.toLowerCase() as 'usdc' | 'zec'
          ]?.address?.toString();
          const collateralPriceState = collateralTokenAddress ? prices.get(collateralTokenAddress) : undefined;
          const collateralPrice = collateralPriceState?.status === 'loaded' && collateralPriceState.price
            ? Number(collateralPriceState.price) / 1e4
            : 0;

          // Get the price for the loan asset (for debt)
          const loanTokenAddress = contracts?.tokens[
            marketConfig.loanAsset.toLowerCase() as 'usdc' | 'zec'
          ]?.address?.toString();
          const loanPriceState = loanTokenAddress ? prices.get(loanTokenAddress) : undefined;
          const loanPrice = loanPriceState?.status === 'loaded' && loanPriceState.price
            ? Number(loanPriceState.price) / 1e4
            : 0;

          // Create collateral position if there's collateral
          if (contractPosition.collateral > 0n) {
            const collateralBalance = contractPosition.collateral;
            const collateralBalanceUSD = (Number(collateralBalance) / 1e18) * collateralPrice;

            collateralPositions.push({
              symbol: marketConfig.collateralAsset.toUpperCase(),
              loanAsset: marketConfig.loanAsset.toLowerCase(),
              collateralAsset: marketConfig.collateralAsset.toLowerCase(),
              balance: collateralBalance,
              balanceUSD: collateralBalanceUSD,
              poolAddress: marketConfig.poolAddress,
              collateralFactor: 0.85, // Hardcoded for now
            });
          }

          // Create debt position if there's debt (principal + interest)
          const totalDebt = contractPosition.principal + contractPosition.interest;
          if (totalDebt > 0n) {
            const debtBalanceUSD = (Number(totalDebt) / 1e18) * loanPrice;

            debtPositions.push({
              symbol: marketConfig.loanAsset.toUpperCase(),
              loanAsset: marketConfig.loanAsset.toLowerCase(),
              collateralAsset: marketConfig.collateralAsset.toLowerCase(),
              balance: totalDebt,
              balanceUSD: debtBalanceUSD,
              poolAddress: marketConfig.poolAddress,
              apy: DEBT_APY,
              healthFactor: 1, // Hardcoded for now
            });
          }
        });
      }

      // Loans will be populated later when the loan position API is available
      // For now, return empty loans
      const loanPositions: LoanPosition[] = [];

      // Calculate totals
      const totalLoansUSD = loanPositions.reduce((sum, pos) => sum + pos.balanceUSD, 0);
      const totalCollateralUSD = collateralPositions.reduce((sum, pos) => sum + pos.balanceUSD, 0);
      const totalDebtUSD = debtPositions.reduce((sum, pos) => sum + pos.balanceUSD, 0);
      const netWorthUSD = totalLoansUSD + totalCollateralUSD - totalDebtUSD;

      const avgHealthFactor = debtPositions.length === 0
        ? 1
        : debtPositions.reduce((sum, pos) => sum + pos.healthFactor, 0) / debtPositions.length;

      setPortfolioData({
        loans: loanPositions,
        collateral: collateralPositions,
        debt: debtPositions,
        totalLoansUSD,
        totalCollateralUSD,
        totalDebtUSD,
        netWorthUSD,
        avgHealthFactor,
      });

      setPortfolioState({ status: 'loaded' });
      hasPortfolioFetchedRef.current = true;
      console.log('[DataContext] Portfolio fetch completed');
    } catch (error) {
      console.error('[DataContext] Error fetching portfolio:', error);
      setPortfolioState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to fetch portfolio',
      });
    } finally {
      isFetchingPortfolioRef.current = false;
    }
  }, [marketConfigs, wallet, userAddress, node, contracts, prices, escrowContracts, ensurePricesLoaded]);

  // ==================== Initial fetch and auto-refresh ====================
  useEffect(() => {
    if (!wallet || !userAddress) {
      console.log('[DataContext] Skipping initial fetch - wallet or address not ready');
      return;
    }

    console.log('[DataContext] Starting initial data fetch');

    // Fetch prices first, then market and portfolio data
    const initFetch = async () => {
      await fetchPrices();
      // Fetch both in parallel after prices are loaded
      await Promise.all([fetchMarkets(), fetchPortfolio()]);
    };

    initFetch();

    const interval = setInterval(() => {
      console.log('[DataContext] Auto-refresh triggered');
      fetchPrices().then(() => {
        Promise.all([fetchMarkets(), fetchPortfolio()]);
      });
    }, REFRESH_INTERVAL);

    return () => {
      console.log('[DataContext] Cleaning up data polling');
      clearInterval(interval);
    };
  }, [fetchPrices, fetchMarkets, fetchPortfolio, wallet, userAddress]);

  // ==================== Context Value ====================
  const value = useMemo<DataContextValue>(() => ({
    prices,
    pricesLoaded,
    markets,
    aggregates,
    marketConfigs,
    portfolioState,
    portfolioData,
    refetchPrices: fetchPrices,
    refetchMarkets: fetchMarkets,
    refetchPortfolio: fetchPortfolio,
  }), [
    prices,
    pricesLoaded,
    markets,
    aggregates,
    marketConfigs,
    portfolioState,
    portfolioData,
    fetchPrices,
    fetchMarkets,
    fetchPortfolio,
  ]);

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
}

export function useDataContext() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useDataContext must be used within a DataProvider');
  }
  return context;
}

export default DataContext;
