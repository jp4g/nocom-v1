'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, PropsWithChildren } from 'react';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { useWallet } from '@/hooks/useWallet';
import { batchSimulatePrices } from '@/lib/contract/price';

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

// APY constants
export const LOAN_APY = 4.00;
export const DEBT_APY = 5.00;

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

export interface PortfolioContextValue {
  state: PortfolioState;
  data: PortfolioData;
  refetch: () => Promise<void>;
}

const defaultData: PortfolioData = {
  loans: [],
  collateral: [],
  debt: [],
  totalLoansUSD: 0,
  totalCollateralUSD: 0,
  totalDebtUSD: 0,
  netWorthUSD: 0,
  avgHealthFactor: 1,
};

const PortfolioContext = createContext<PortfolioContextValue | undefined>(undefined);

export function PortfolioProvider({ children }: PropsWithChildren) {
  const { contracts, wallet: walletHandle, activeAccount } = useWallet();

  const wallet = useMemo(() => walletHandle?.instance, [walletHandle]);
  const userAddress = useMemo(() =>
    activeAccount?.address ? AztecAddress.fromString(activeAccount.address) : undefined,
    [activeAccount?.address]
  );

  const [state, setState] = useState<PortfolioState>({ status: 'loading' });
  const [data, setData] = useState<PortfolioData>(defaultData);
  const isFetchingRef = useRef(false);
  const hasFetchedRef = useRef(false);

  // Build pool configs
  const poolConfigs = useMemo(() => {
    if (!contracts) return [];

    return [
      {
        poolAddress: contracts.pools.usdcToZec.address.toString(),
        loanAsset: 'ZEC',
        collateralAsset: 'USDC',
        loanTokenAddress: contracts.tokens.zec.address,
        collateralTokenAddress: contracts.tokens.usdc.address,
      },
      {
        poolAddress: contracts.pools.zecToUsdc.address.toString(),
        loanAsset: 'USDC',
        collateralAsset: 'ZEC',
        loanTokenAddress: contracts.tokens.usdc.address,
        collateralTokenAddress: contracts.tokens.zec.address,
      },
    ];
  }, [contracts]);

  // Get unique token addresses for price fetching
  const tokenAddresses = useMemo(() => {
    const addresses = new Set<string>();
    poolConfigs.forEach(config => {
      addresses.add(config.loanTokenAddress.toString());
      addresses.add(config.collateralTokenAddress.toString());
    });
    return Array.from(addresses).map(addr => AztecAddress.fromString(addr));
  }, [poolConfigs]);

  const fetchPortfolio = useCallback(async () => {
    if (isFetchingRef.current) {
      console.log('[PortfolioContext] Fetch already in progress, skipping');
      return;
    }

    isFetchingRef.current = true;

    // Only show loading state if we haven't fetched before
    if (!hasFetchedRef.current) {
      setState({ status: 'loading' });
    }

    try {
      console.log('[PortfolioContext] Starting portfolio fetch');

      // Fetch prices if wallet is connected
      const pricesMap = new Map<string, bigint>();
      if (wallet && userAddress && contracts?.oracle && tokenAddresses.length > 0) {
        try {
          const priceResults = await batchSimulatePrices(tokenAddresses, contracts.oracle, wallet, userAddress);
          priceResults.forEach((price, addr) => {
            pricesMap.set(addr.toString(), price);
          });
          console.log('[PortfolioContext] Prices fetched:', pricesMap);
        } catch (error) {
          console.error('[PortfolioContext] Error fetching prices:', error);
        }
      }

      // For now, return hardcoded mock data
      // TODO: Replace with actual contract calls
      const mockLoans: LoanPosition[] = [
        {
          symbol: 'USDC',
          loanAsset: 'usdc',
          collateralAsset: 'zec',
          balance: 14500500000000000000000n,
          balanceUSD: 14500.50,
          poolAddress: poolConfigs[0]?.poolAddress || '',
          apy: LOAN_APY,
        },
        {
          symbol: 'ZEC',
          loanAsset: 'zec',
          collateralAsset: 'usdc',
          balance: 3850000000000000000n,
          balanceUSD: 9999.50,
          poolAddress: poolConfigs[1]?.poolAddress || '',
          apy: LOAN_APY,
        },
      ];

      const mockCollateral: CollateralPosition[] = [
        {
          symbol: 'ZEC',
          loanAsset: 'usdc',
          collateralAsset: 'zec',
          balance: 5000000000000000000n,
          balanceUSD: 12500.00,
          poolAddress: poolConfigs[0]?.poolAddress || '',
          collateralFactor: 0.85,
        },
        {
          symbol: 'USDC',
          loanAsset: 'zec',
          collateralAsset: 'usdc',
          balance: 10000000000000000000000n,
          balanceUSD: 10000.00,
          poolAddress: poolConfigs[1]?.poolAddress || '',
          collateralFactor: 0.90,
        },
      ];

      const mockDebt: DebtPosition[] = [
        {
          symbol: 'USDC',
          loanAsset: 'usdc',
          collateralAsset: 'zec',
          balance: 8200000000000000000000n,
          balanceUSD: 8200.00,
          poolAddress: poolConfigs[0]?.poolAddress || '',
          apy: DEBT_APY,
          healthFactor: 1,
        },
        {
          symbol: 'ZEC',
          loanAsset: 'zec',
          collateralAsset: 'usdc',
          balance: 45000000000000000n,
          balanceUSD: 2094.18,
          poolAddress: poolConfigs[1]?.poolAddress || '',
          apy: DEBT_APY,
          healthFactor: 1,
        },
      ];

      // Calculate totals
      const totalLoansUSD = mockLoans.reduce((sum, pos) => sum + pos.balanceUSD, 0);
      const totalCollateralUSD = mockCollateral.reduce((sum, pos) => sum + pos.balanceUSD, 0);
      const totalDebtUSD = mockDebt.reduce((sum, pos) => sum + pos.balanceUSD, 0);
      const netWorthUSD = totalLoansUSD + totalCollateralUSD - totalDebtUSD;

      const avgHealthFactor = mockDebt.length === 0
        ? 1
        : mockDebt.reduce((sum, pos) => sum + pos.healthFactor, 0) / mockDebt.length;

      setData({
        loans: mockLoans,
        collateral: mockCollateral,
        debt: mockDebt,
        totalLoansUSD,
        totalCollateralUSD,
        totalDebtUSD,
        netWorthUSD,
        avgHealthFactor,
      });

      setState({ status: 'loaded' });
      hasFetchedRef.current = true;
      console.log('[PortfolioContext] Portfolio fetch complete');
    } catch (error) {
      console.error('[PortfolioContext] Error fetching portfolio:', error);
      setState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to fetch portfolio',
      });
    } finally {
      isFetchingRef.current = false;
    }
  }, [poolConfigs, contracts?.oracle, wallet, userAddress, tokenAddresses]);

  // Initial fetch and auto-refresh
  useEffect(() => {
    console.log('[PortfolioContext] Setting up portfolio polling');
    fetchPortfolio();

    const interval = setInterval(() => {
      fetchPortfolio();
    }, REFRESH_INTERVAL);

    return () => {
      console.log('[PortfolioContext] Cleaning up portfolio polling');
      clearInterval(interval);
    };
  }, [fetchPortfolio]);

  const value = useMemo<PortfolioContextValue>(() => ({
    state,
    data,
    refetch: fetchPortfolio,
  }), [state, data, fetchPortfolio]);

  return (
    <PortfolioContext.Provider value={value}>
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolioContext() {
  const context = useContext(PortfolioContext);
  if (!context) {
    throw new Error('usePortfolioContext must be used within a PortfolioProvider');
  }
  return context;
}

export default PortfolioContext;
