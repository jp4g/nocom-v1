'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { BaseWallet } from '@aztec/aztec.js/wallet';
import { NocomLendingPoolV1Contract, NocomEscrowV1Contract, MockPriceFeedContract } from '@nocom-v1/contracts/artifacts';
import { batchSimulatePrices } from '@/lib/contract/price';
import { EmbeddedWallet } from '@/lib/wallet/embeddedWallet';

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

export interface UsePortfolioReturn {
  state: PortfolioState;
  data: PortfolioData;
  refetch: () => Promise<void>;
}

interface PoolConfig {
  poolAddress: string;
  loanAsset: string;
  collateralAsset: string;
  loanTokenAddress: AztecAddress;
  collateralTokenAddress: AztecAddress;
  contract: NocomLendingPoolV1Contract;
}

/**
 * Hook to fetch and manage user portfolio data.
 *
 * Features:
 * - Fetches loans, collateral, and debt positions
 * - Calculates USD values using price oracle
 * - Computes totals and health factors
 * - Auto-refreshes every 5 minutes
 * - Progressive loading state updates
 *
 * @param poolConfigs - Array of pool configurations
 * @param escrowContracts - Map of pool address to escrow contract
 * @param oracleContract - Price oracle contract
 * @param wallet - The wallet to use for simulations
 * @param userAddress - The user's address
 * @returns Object containing portfolio state, data, and refetch function
 */
export function usePortfolio(
  poolConfigs: PoolConfig[],
  escrowContracts: Map<string, NocomEscrowV1Contract>,
  oracleContract: MockPriceFeedContract | undefined,
  wallet: EmbeddedWallet | BaseWallet | undefined,
  userAddress: AztecAddress | undefined
): UsePortfolioReturn {
  const [state, setState] = useState<PortfolioState>({ status: 'loading' });
  const [data, setData] = useState<PortfolioData>({
    loans: [],
    collateral: [],
    debt: [],
    totalLoansUSD: 0,
    totalCollateralUSD: 0,
    totalDebtUSD: 0,
    netWorthUSD: 0,
    avgHealthFactor: 1,
  });

  const isFetchingRef = useRef(false);

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
      console.log('[usePortfolio] Fetch already in progress, skipping');
      return;
    }

    isFetchingRef.current = true;
    setState({ status: 'loading' });

    try {
      console.log('[usePortfolio] Starting portfolio fetch');

      // Fetch prices if wallet is connected
      const pricesMap = new Map<string, bigint>();
      if (wallet && userAddress && oracleContract && tokenAddresses.length > 0) {
        try {
          const priceResults = await batchSimulatePrices(tokenAddresses, oracleContract, wallet, userAddress);
          priceResults.forEach((price, addr) => {
            pricesMap.set(addr.toString(), price);
          });
          console.log('[usePortfolio] Prices fetched:', pricesMap);
        } catch (error) {
          console.error('[usePortfolio] Error fetching prices:', error);
        }
      }

      // Helper to convert token amount to USD
      // amount is in 18 decimals, price is in 1e4 scale
      const tokenAmountToUSD = (amount: bigint, tokenAddress: AztecAddress): number => {
        const price = pricesMap.get(tokenAddress.toString());
        if (!price) return 0;
        return Number((amount * price)) / 1e22;
      };

      // For now, return hardcoded mock data
      // TODO: Replace with actual contract calls
      const mockLoans: LoanPosition[] = [
        {
          symbol: 'USDC',
          loanAsset: 'usdc',
          collateralAsset: 'zec',
          balance: 14500500000000000000000n, // 14500.50 with 18 decimals
          balanceUSD: 14500.50,
          poolAddress: poolConfigs[0]?.poolAddress || '',
          apy: LOAN_APY,
        },
        {
          symbol: 'ZEC',
          loanAsset: 'zec',
          collateralAsset: 'usdc',
          balance: 3850000000000000000n, // 3.85 with 18 decimals
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
          balance: 5000000000000000000n, // 5 ZEC with 18 decimals
          balanceUSD: 12500.00,
          poolAddress: poolConfigs[0]?.poolAddress || '',
          collateralFactor: 0.85,
        },
        {
          symbol: 'USDC',
          loanAsset: 'zec',
          collateralAsset: 'usdc',
          balance: 10000000000000000000000n, // 10000 USDC with 18 decimals
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
          balance: 8200000000000000000000n, // 8200 USDC with 18 decimals
          balanceUSD: 8200.00,
          poolAddress: poolConfigs[0]?.poolAddress || '',
          apy: DEBT_APY,
          healthFactor: 1,
        },
        {
          symbol: 'ZEC',
          loanAsset: 'zec',
          collateralAsset: 'usdc',
          balance: 45000000000000000n, // 0.045 ZEC with 18 decimals
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

      // Calculate average health factor
      // If no debt positions, health factor is 1
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
      console.log('[usePortfolio] Portfolio fetch complete');
    } catch (error) {
      console.error('[usePortfolio] Error fetching portfolio:', error);
      setState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to fetch portfolio',
      });
    } finally {
      isFetchingRef.current = false;
    }
  }, [poolConfigs, escrowContracts, oracleContract, wallet, userAddress, tokenAddresses]);

  // Initial fetch and auto-refresh
  useEffect(() => {
    console.log('[usePortfolio] Setting up portfolio polling');
    fetchPortfolio();

    const interval = setInterval(() => {
      fetchPortfolio();
    }, REFRESH_INTERVAL);

    return () => {
      console.log('[usePortfolio] Cleaning up portfolio polling');
      clearInterval(interval);
    };
  }, [fetchPortfolio]);

  return {
    state,
    data,
    refetch: fetchPortfolio,
  };
}
