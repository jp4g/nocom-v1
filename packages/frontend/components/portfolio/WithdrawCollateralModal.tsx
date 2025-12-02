'use client';

import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { BaseWallet } from '@aztec/aztec.js/wallet';
import { NocomEscrowV1Contract } from '@nocom-v1/contracts/artifacts';
import { CollateralPosition, DebtPosition, useDataContext } from '@/contexts/DataContext';
import { parseTokenAmount } from '@/lib/utils';
import { withdrawCollateral } from '@nocom-v1/contracts/contract';
import { simulationQueue } from '@/lib/utils/simulationQueue';
import { math } from '@nocom-v1/contracts/utils';
import { LTV_BASE, USDC_LTV, ZCASH_LTV, PRICE_BASE } from '@nocom-v1/contracts/constants';

const { calculateLtvHealth } = math;

type WithdrawCollateralModalProps = {
  open: boolean;
  onClose: () => void;
  collateralPosition: CollateralPosition | null;
  escrowContract: NocomEscrowV1Contract | undefined;
  wallet: BaseWallet | undefined;
  userAddress: AztecAddress | undefined;
};

// Get max LTV based on collateral asset
const getMaxLtv = (collateralAsset: string): bigint => {
  if (collateralAsset.toUpperCase() === 'USDC') {
    return USDC_LTV;
  }
  return ZCASH_LTV;
};

// Convert LTV_BASE value to percentage
const ltvToPercent = (ltv: bigint): number => {
  return Number(ltv) / Number(LTV_BASE) * 100;
};

// Calculate the health bar indicator position (0-100%)
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

export default function WithdrawCollateralModal({
  open,
  onClose,
  collateralPosition,
  escrowContract,
  wallet,
  userAddress,
}: WithdrawCollateralModalProps) {
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<string>('');
  const [mounted, setMounted] = useState(false);

  const { prices, portfolioData } = useDataContext();

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

  // Get prices for calculation
  const collateralPrice = useMemo(() => {
    if (!collateralPosition) return 10000n;
    const collateralSymbol = collateralPosition.collateralAsset.toLowerCase();
    for (const [address, priceState] of prices.entries()) {
      if (priceState.status === 'loaded' && priceState.price !== undefined) {
        if (address.toLowerCase().includes(collateralSymbol) ||
            (collateralSymbol === 'usdc' && priceState.price === 10000n) ||
            (collateralSymbol === 'zec' && priceState.price !== 10000n)) {
          return priceState.price;
        }
      }
    }
    if (collateralSymbol === 'usdc') return 10000n;
    return 10000n;
  }, [prices, collateralPosition]);

  const debtPrice = useMemo(() => {
    if (!collateralPosition) return 10000n;
    const debtSymbol = collateralPosition.loanAsset.toLowerCase();
    for (const [, priceState] of prices.entries()) {
      if (priceState.status === 'loaded' && priceState.price !== undefined) {
        if (debtSymbol === 'usdc') return 10000n;
        return priceState.price;
      }
    }
    return 10000n;
  }, [prices, collateralPosition]);

  // Get debt position for this market (same poolAddress)
  const debtPosition = useMemo(() => {
    if (!collateralPosition) return null;
    return portfolioData.debt.find(
      d => d.poolAddress === collateralPosition.poolAddress
    ) ?? null;
  }, [portfolioData.debt, collateralPosition]);

  const currentCollateral = collateralPosition?.balance ?? 0n;
  const currentDebt = debtPosition?.balance ?? 0n;

  // Format amounts
  const formatAmount = (amount: bigint): string => {
    if (amount === 0n) return '0.000000';
    return (Number(amount) / 1e18).toFixed(6);
  };

  // Format full precision for max withdraw
  const formatFullPrecision = (amount: bigint): string => {
    const str = amount.toString().padStart(19, '0');
    const whole = str.slice(0, -18) || '0';
    const decimal = str.slice(-18);
    const trimmedDecimal = decimal.replace(/0+$/, '') || '0';
    return `${whole}.${trimmedDecimal}`;
  };

  // Get max LTV for this market's collateral
  const maxLtv = useMemo(() => {
    if (!collateralPosition) return ZCASH_LTV;
    return getMaxLtv(collateralPosition.collateralAsset);
  }, [collateralPosition]);

  // Calculate current health factor
  const currentHealthFactor = useMemo(() => {
    if (currentCollateral === 0n || currentDebt === 0n) {
      return 0; // No debt means infinite health
    }

    const healthRaw = calculateLtvHealth(
      debtPrice,
      currentDebt,
      collateralPrice,
      currentCollateral,
      maxLtv
    );

    return Number(healthRaw) / Number(LTV_BASE);
  }, [currentCollateral, currentDebt, collateralPrice, debtPrice, maxLtv]);

  // Calculate current LTV percentage
  const currentLtvPercent = useMemo(() => {
    if (currentCollateral === 0n) return 0;

    const collateralValue = (currentCollateral * collateralPrice) / PRICE_BASE;
    const debtValue = (currentDebt * debtPrice) / PRICE_BASE;

    if (collateralValue === 0n) return 0;
    return Number((debtValue * 10000n) / collateralValue) / 100;
  }, [currentCollateral, currentDebt, collateralPrice, debtPrice]);

  // Calculate health factor after withdrawal
  const healthAfterWithdraw = useMemo(() => {
    if (!inputValue || inputValue === '0' || inputValue === '.') {
      return currentHealthFactor;
    }

    try {
      const withdrawAmount = parseTokenAmount(inputValue);
      const newCollateral = currentCollateral > withdrawAmount
        ? currentCollateral - withdrawAmount
        : 0n;

      // If no debt, health is infinite
      if (currentDebt === 0n) {
        return 0; // 0 means infinite/no debt
      }

      // If withdrawing all collateral but have debt, health is 0 (bad)
      if (newCollateral === 0n && currentDebt > 0n) {
        return 0.01; // Very low health to indicate danger
      }

      const healthRaw = calculateLtvHealth(
        debtPrice,
        currentDebt,
        collateralPrice,
        newCollateral,
        maxLtv
      );

      return Number(healthRaw) / Number(LTV_BASE);
    } catch {
      return currentHealthFactor;
    }
  }, [inputValue, currentCollateral, currentDebt, collateralPrice, debtPrice, maxLtv, currentHealthFactor]);

  // Calculate max withdrawable amount (keeping health >= 1.0)
  const maxWithdrawable = useMemo(() => {
    // If no debt, can withdraw everything
    if (currentDebt === 0n) {
      return currentCollateral;
    }

    // Max withdraw = collateral - (debt_value / (max_ltv * collateral_price))
    // We need to keep: collateral_value * max_ltv >= debt_value
    // So min_collateral_value = debt_value / max_ltv
    // min_collateral = min_collateral_value * PRICE_BASE / collateral_price
    const debtValue = (currentDebt * debtPrice) / PRICE_BASE;
    const minCollateralValue = (debtValue * LTV_BASE) / maxLtv;
    const minCollateral = (minCollateralValue * PRICE_BASE) / collateralPrice;

    // Add a small buffer (1%) to ensure we stay safe
    const minCollateralWithBuffer = (minCollateral * 101n) / 100n;

    if (currentCollateral <= minCollateralWithBuffer) {
      return 0n;
    }

    return currentCollateral - minCollateralWithBuffer;
  }, [currentCollateral, currentDebt, collateralPrice, debtPrice, maxLtv]);

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

  // Validation - check health factor stays safe
  const isValidInput = useMemo(() => {
    if (!inputValue || inputValue === '0' || inputValue === '0.' || inputValue === '.') {
      return false;
    }
    try {
      const amount = parseTokenAmount(inputValue);
      if (amount <= 0n) return false;
      if (amount > currentCollateral) return false;
      // If there's debt, check health factor
      if (currentDebt > 0n && healthAfterWithdraw < 1.0) return false;
      return true;
    } catch {
      return false;
    }
  }, [inputValue, currentCollateral, currentDebt, healthAfterWithdraw]);

  // Check if withdrawal would be unsafe
  const isHealthUnsafe = currentDebt > 0n && healthAfterWithdraw < 1.0 && healthAfterWithdraw > 0 && inputValue !== '';

  const handleWithdraw = async () => {
    if (!isValidInput || !wallet || !userAddress || !escrowContract) return;

    setIsProcessing(true);

    try {
      const amount = parseTokenAmount(inputValue);
      setProcessingStep('Withdrawing collateral...');

      const txReceipt = await simulationQueue.enqueue(() =>
        withdrawCollateral(
          userAddress,
          escrowContract,
          amount,
          collateralPrice,
          debtPrice
        )
      );
      console.log('Withdraw collateral transaction receipt:', txReceipt);

      toast.success(`Successfully withdrew ${inputValue} ${collateralPosition?.symbol}`);
      onClose();
    } catch (error) {
      console.error('Withdraw collateral error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to withdraw collateral');
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  const handleMaxClick = () => {
    if (currentDebt === 0n) {
      // No debt, can withdraw all
      setInputValue(formatFullPrecision(currentCollateral));
    } else {
      // Has debt, use safe max
      setInputValue(formatFullPrecision(maxWithdrawable));
    }
  };

  if (!open || !mounted || !collateralPosition) return null;

  const healthIndicatorPosition = 100 - getHealthBarPosition(healthAfterWithdraw);
  const hasDebt = currentDebt > 0n;

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
                Withdrawing {collateralPosition.symbol}...
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
                    Withdraw {collateralPosition.symbol}
                  </h2>
                  <p className="text-sm text-text-muted mt-1">
                    {collateralPosition.loanAsset.toUpperCase()} / {collateralPosition.collateralAsset.toUpperCase()} Market
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
              {/* Two Column Layout: Position & Health */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                {/* Left: Position Details */}
                <div className="p-4 bg-surface-hover border border-surface-border rounded-lg">
                  <div className="text-xs text-text-muted uppercase tracking-wider mb-3">Your Position</div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-text-muted">Collateral</span>
                      <span className="text-green-400 font-mono text-sm">
                        {formatAmount(currentCollateral)} {collateralPosition.symbol}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-text-muted">Debt</span>
                      <span className="text-red-400 font-mono text-sm">
                        {formatAmount(currentDebt)} {collateralPosition.loanAsset.toUpperCase()}
                      </span>
                    </div>
                    {hasDebt && (
                      <div className="border-t border-surface-border pt-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-text-muted">Max Withdrawable</span>
                          <span className="text-sm font-mono text-text-muted">
                            {formatAmount(maxWithdrawable)} {collateralPosition.symbol}
                          </span>
                        </div>
                      </div>
                    )}
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
                        {ltvToPercent(maxLtv).toFixed(0)}%
                      </span>
                    </div>
                    <div className="border-t border-surface-border pt-3">
                      <div className="flex justify-between items-end mb-2">
                        <span className="text-sm text-text-muted">
                          {inputValue ? 'Health After' : 'Health'}
                        </span>
                        <span className={`text-lg font-mono ${hasDebt ? getHealthColor(healthAfterWithdraw) : 'text-green-500'}`}>
                          {hasDebt ? (healthAfterWithdraw > 0 ? healthAfterWithdraw.toFixed(2) : '0.00') : '∞'}
                        </span>
                      </div>
                      {hasDebt && (
                        <div className="w-full h-2 bg-surface-border rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 w-full relative">
                            {healthAfterWithdraw > 0 && (
                              <div
                                className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_8px_white]"
                                style={{ right: `${healthIndicatorPosition}%` }}
                              ></div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Input Section */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-white">
                    Amount to Withdraw
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={inputValue}
                      onChange={handleInputChange}
                      placeholder="0.00"
                      disabled={!escrowContract}
                      className="w-full px-4 py-3 bg-surface-hover border border-surface-border rounded-lg text-white placeholder-text-muted focus:outline-none focus:border-brand-purple transition-colors font-mono text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <button
                      onClick={handleMaxClick}
                      disabled={!escrowContract}
                      className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-medium text-brand-purple hover:text-brand-purple-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      MAX
                    </button>
                  </div>
                  <div className="text-xs text-text-muted">
                    {collateralPosition.symbol}
                  </div>
                </div>

                {/* Health Warning */}
                {isHealthUnsafe && (
                  <div className="p-3 bg-red-900/20 border border-red-900/50 rounded-lg">
                    <p className="text-sm text-red-400">
                      This withdrawal would put your position at risk of liquidation.
                    </p>
                  </div>
                )}

                {/* Withdraw Button */}
                <button
                  onClick={handleWithdraw}
                  disabled={!isValidInput || !escrowContract}
                  className="w-full px-4 py-3 bg-brand-purple hover:bg-brand-purple-hover text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-brand-purple"
                >
                  {!escrowContract ? (
                    'No Escrow Found'
                  ) : isHealthUnsafe ? (
                    'Health Factor Too Low'
                  ) : (
                    `Withdraw ${collateralPosition.symbol}`
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
