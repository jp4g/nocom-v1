'use client';

import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { BaseWallet } from '@aztec/aztec.js/wallet';
import { parseTokenAmount } from '@/lib/utils';
import { useDataContext, StableMarketWithContract } from '@/contexts/DataContext';
import { useStableEscrow } from '@/hooks/useStableEscrow';
import { mintStable } from '@nocom-v1/contracts/contract';
import { simulationQueue } from '@/lib/utils/simulationQueue';
import { math } from '@nocom-v1/contracts/utils';
import { ZCASH_LTV, PRICE_BASE, HEALTH_FACTOR_THRESHOLD } from '@nocom-v1/contracts/constants';

const { calculateLtvHealth } = math;

type StableBorrowModalProps = {
  open: boolean;
  onClose: () => void;
  market: StableMarketWithContract;
  wallet: BaseWallet | undefined;
  userAddress: AztecAddress | undefined;
};

// Stablecoins use ZEC as collateral, so we use ZCASH_LTV
const STABLE_MAX_LTV = ZCASH_LTV;

// Convert LTV value to percentage (LTV values are on scale where 100000 = 100%)
const ltvToPercent = (ltv: bigint): number => {
  return Number(ltv) / Number(HEALTH_FACTOR_THRESHOLD) * 100;
};

// Calculate the health bar indicator position (0-100%)
// Health factor 1.0 = 0%, 3.0+ = 100%
const getHealthBarPosition = (hf: number) => {
  const minHF = 1.0;
  const maxHF = 3.0;
  const clamped = Math.max(minHF, Math.min(maxHF, hf));
  return ((clamped - minHF) / (maxHF - minHF)) * 100;
};

const getHealthColor = (hf: number) => {
  if (hf < 1.0) return 'text-red-500';
  if (hf < 1.1) return 'text-red-500';
  if (hf < 1.5) return 'text-yellow-500';
  return 'text-green-500';
};

// zUSD is always $1 (10000 in price oracle units with 4 decimals)
const ZUSD_PRICE = 10000n;

export default function StableBorrowModal({
  open,
  onClose,
  market,
  wallet,
  userAddress,
}: StableBorrowModalProps) {
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<string>('');
  const [mounted, setMounted] = useState(false);

  const { prices } = useDataContext();

  // Get stable escrow contract for this market
  const { escrowContract, isLoading: isEscrowLoading } = useStableEscrow(market.poolAddress);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setInputValue('');
      setIsProcessing(false);
      setProcessingStep('');
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // Get collateral price (ZEC)
  const collateralPrice = useMemo(() => {
    // Find ZEC price - it's the non-USDC price
    for (const [, priceState] of prices.entries()) {
      if (priceState.status === 'loaded' && priceState.price !== undefined && priceState.price !== 10000n) {
        return priceState.price;
      }
    }
    return 500000n; // Default fallback ($50 in oracle units)
  }, [prices]);

  // TODO: Get user's current stable position for this market from portfolio data
  // For now, we'll use placeholder values - this should be wired up to DataContext
  const currentPosition = useMemo(() => {
    return {
      collateral: 0n, // Will be fetched from stable pool position
      debt: 0n, // Will be fetched from stable pool position
    };
  }, []);

  // Format amounts
  const formatAmount = (amount: bigint): string => {
    if (amount === 0n) return '0.000000';
    return (Number(amount) / 1e18).toFixed(6);
  };

  // Calculate current LTV health
  const currentHealthFactor = useMemo(() => {
    // No debt means infinite health (safe)
    if (currentPosition.debt === 0n) {
      return Infinity;
    }
    // No collateral with debt means critical (0)
    if (currentPosition.collateral === 0n) {
      return 0;
    }

    const healthRaw = calculateLtvHealth(
      ZUSD_PRICE,
      currentPosition.debt,
      collateralPrice,
      currentPosition.collateral,
      STABLE_MAX_LTV
    );

    return Number(healthRaw) / Number(HEALTH_FACTOR_THRESHOLD);
  }, [currentPosition, collateralPrice]);

  // Calculate current LTV percentage
  const currentLtvPercent = useMemo(() => {
    if (currentPosition.collateral === 0n) return 0;

    const collateralValue = (currentPosition.collateral * collateralPrice) / PRICE_BASE;
    const debtValue = (currentPosition.debt * ZUSD_PRICE) / PRICE_BASE;

    if (collateralValue === 0n) return 0;
    return Number((debtValue * 10000n) / collateralValue) / 100;
  }, [currentPosition, collateralPrice]);

  // Calculate health factor after minting
  const healthAfterMint = useMemo(() => {
    if (!inputValue || inputValue === '0' || inputValue === '.') {
      return currentHealthFactor;
    }

    try {
      const mintAmount = parseTokenAmount(inputValue);
      const newDebt = currentPosition.debt + mintAmount;

      if (currentPosition.collateral === 0n) {
        return 0;
      }

      const healthRaw = calculateLtvHealth(
        ZUSD_PRICE,
        newDebt,
        collateralPrice,
        currentPosition.collateral,
        STABLE_MAX_LTV
      );

      return Number(healthRaw) / Number(HEALTH_FACTOR_THRESHOLD);
    } catch {
      return currentHealthFactor;
    }
  }, [inputValue, currentPosition, collateralPrice, currentHealthFactor]);

  // Calculate max mintable amount based on collateral and health factor
  const maxMintable = useMemo(() => {
    if (currentPosition.collateral === 0n) return 0n;

    const collateralValue = (currentPosition.collateral * collateralPrice) / PRICE_BASE;
    const maxDebtValue = (collateralValue * STABLE_MAX_LTV) / HEALTH_FACTOR_THRESHOLD;
    const maxDebtAmount = (maxDebtValue * PRICE_BASE) / ZUSD_PRICE;

    const availableToMint = maxDebtAmount > currentPosition.debt
      ? maxDebtAmount - currentPosition.debt
      : 0n;

    return availableToMint;
  }, [currentPosition, collateralPrice]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    if (value === '') {
      setInputValue('');
      return;
    }

    if (/^\d*\.?\d*$/.test(value)) {
      setInputValue(value);
    }
  };

  // Validation
  const isValidInput = useMemo(() => {
    if (!inputValue || inputValue === '0' || inputValue === '0.' || inputValue === '.') {
      return false;
    }
    try {
      const amount = parseTokenAmount(inputValue);
      if (amount <= 0n) return false;
      if (amount > maxMintable) return false;
      if (healthAfterMint < 1.0 && currentPosition.collateral > 0n) return false;
      return true;
    } catch {
      return false;
    }
  }, [inputValue, maxMintable, healthAfterMint, currentPosition.collateral]);

  const hasNoCollateral = currentPosition.collateral === 0n;
  const isHealthUnsafe = healthAfterMint < 1.0 && healthAfterMint > 0 && inputValue !== '';

  const handleMint = async () => {
    if (!isValidInput || !wallet || !userAddress || !escrowContract) return;

    setIsProcessing(true);

    try {
      const amount = parseTokenAmount(inputValue);
      setProcessingStep('Minting zUSD...');

      const txReceipt = await simulationQueue.enqueue(() =>
        mintStable(
          userAddress,
          escrowContract,
          amount,
          collateralPrice
        )
      );
      console.log('Mint transaction receipt:', txReceipt);

      toast.success(`Successfully minted ${inputValue} zUSD`);
      onClose();
    } catch (error) {
      console.error('Mint error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to mint');
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  const handleMaxClick = () => {
    const safeMax = (maxMintable * 95n) / 100n;
    const formatted = formatAmount(safeMax);
    const trimmed = formatted.replace(/\.?0+$/, '');
    setInputValue(trimmed || '0');
  };

  if (!open || !mounted) return null;

  const healthIndicatorPosition = 100 - getHealthBarPosition(healthAfterMint);

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm overflow-hidden"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isProcessing) {
          onClose();
        }
      }}
    >
      <div className="relative w-full max-w-2xl bg-surface border border-surface-border rounded-lg shadow-xl mx-4">
        {isProcessing ? (
          <div className="p-6">
            <div className="border-b border-surface-border pb-6">
              <h2 className="text-xl font-semibold text-white">
                Minting zUSD...
              </h2>
            </div>
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 animate-spin text-brand-purple mb-4" />
              {processingStep && (
                <p className="text-sm text-text-muted mt-2">{processingStep}</p>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="p-6 border-b border-surface-border">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    Mint zUSD
                  </h2>
                  <p className="text-sm text-text-muted mt-1">
                    Mint stablecoins backed by your {market.collateralAsset} collateral
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="text-text-muted hover:text-white transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6">
              {/* Warning */}
              {hasNoCollateral && (
                <div className="mb-6">
                  <div className="p-3 bg-yellow-900/20 border border-yellow-900/50 rounded-lg">
                    <p className="text-sm text-yellow-400">
                      <strong>No collateral:</strong> You need to deposit collateral before you can mint zUSD.
                    </p>
                  </div>
                </div>
              )}

              {/* Two Column Layout: Position & Health */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                {/* Left: Position Details */}
                <div className="p-4 bg-surface-hover border border-surface-border rounded-lg">
                  <div className="text-xs text-text-muted uppercase tracking-wider mb-3">Your Position</div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-text-muted">Collateral</span>
                      <span className="text-green-400 font-mono text-sm">
                        {formatAmount(currentPosition.collateral)} {market.collateralAsset}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-text-muted">Minted zUSD</span>
                      <span className="text-red-400 font-mono text-sm">
                        {formatAmount(currentPosition.debt)} zUSD
                      </span>
                    </div>
                    <div className="border-t border-surface-border pt-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-text-muted">Stability Fee</span>
                        <span className="text-sm font-mono text-text-muted">
                          {market.borrowApy.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Health Status */}
                <div className="p-4 bg-surface-hover border border-surface-border rounded-lg">
                  <div className="text-xs text-text-muted uppercase tracking-wider mb-3">Health Status</div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-text-muted">Current LTV</span>
                      <span className="text-white font-mono text-sm">
                        {currentLtvPercent.toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-text-muted">Max LTV</span>
                      <span className="text-text-muted font-mono text-sm">
                        {ltvToPercent(STABLE_MAX_LTV).toFixed(0)}%
                      </span>
                    </div>
                    <div className="border-t border-surface-border pt-3">
                      <div className="flex justify-between items-end mb-2">
                        <span className="text-sm text-text-muted">
                          {inputValue ? 'Health After' : 'Health'}
                        </span>
                        <span className={`text-lg font-mono ${getHealthColor(healthAfterMint)}`}>
                          {healthAfterMint > 0 ? healthAfterMint.toFixed(2) : '∞'}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-surface-border rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 w-full relative">
                          {healthAfterMint > 0 && (
                            <div
                              className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_8px_white]"
                              style={{ right: `${healthIndicatorPosition}%` }}
                            ></div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Input Section */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-white">
                    Amount to Mint
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={inputValue}
                      onChange={handleInputChange}
                      placeholder="0.00"
                      disabled={hasNoCollateral || !escrowContract}
                      className="w-full px-4 py-3 bg-surface-hover border border-surface-border rounded-lg text-white placeholder-text-muted focus:outline-none focus:border-brand-purple transition-colors font-mono text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <button
                      onClick={handleMaxClick}
                      disabled={hasNoCollateral || !escrowContract}
                      className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-medium text-brand-purple hover:text-brand-purple-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      MAX
                    </button>
                  </div>
                  <div className="text-xs text-text-muted">
                    zUSD
                  </div>
                </div>

                {/* Health Warning */}
                {isHealthUnsafe && (
                  <div className="p-3 bg-red-900/20 border border-red-900/50 rounded-lg">
                    <p className="text-sm text-red-400">
                      This mint amount would put your position at risk of liquidation.
                    </p>
                  </div>
                )}

                {/* Mint Button */}
                <button
                  onClick={handleMint}
                  disabled={!isValidInput || isEscrowLoading || !escrowContract}
                  className="w-full px-4 py-3 bg-brand-purple hover:bg-brand-purple-hover text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-brand-purple"
                >
                  {isEscrowLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading...
                    </span>
                  ) : hasNoCollateral ? (
                    'Deposit Collateral First'
                  ) : isHealthUnsafe ? (
                    'Health Factor Too Low'
                  ) : (
                    'Mint zUSD'
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
