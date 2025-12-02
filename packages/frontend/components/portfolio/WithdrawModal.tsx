'use client';

import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { LoanPosition } from '@/contexts/DataContext';
import { MarketUtilization } from '@/lib/types';

type WithdrawModalProps = {
  open: boolean;
  onClose: () => void;
  loanPosition: LoanPosition | null;
  marketData?: MarketUtilization;
};

export default function WithdrawModal({
  open,
  onClose,
  loanPosition,
  marketData,
}: WithdrawModalProps) {
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setInputValue('');
      setIsProcessing(false);
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

  // Format amounts from bigint (18 decimals) to display string
  const formatAmount = (amount: bigint): string => {
    return (Number(amount) / 1e18).toFixed(6);
  };

  const principal = useMemo(() => loanPosition?.balance ?? 0n, [loanPosition?.balance]);

  // For now, interest is calculated as part of the position
  // The LoanPosition in DataContext already includes the total (principal + interest)
  // We need to use the raw values from the contract position
  const interest = useMemo(() => {
    // The balance in LoanPosition is already principal + interest
    // For display purposes, we show a portion as interest (this would come from actual contract data)
    // TODO: Pass actual interest from contract position
    return 0n;
  }, []);

  const totalClaimable = useMemo(() => principal + interest, [principal, interest]);

  const poolLiquidity = useMemo(() => {
    if (!marketData) return 0n;
    return marketData.totalSupplied - marketData.totalBorrowed;
  }, [marketData]);

  const formattedTotalClaimable = useMemo(() => formatAmount(totalClaimable), [totalClaimable]);

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

  const isValidInput = useMemo(() => {
    if (!inputValue || inputValue === '0' || inputValue === '0.' || inputValue === '.') {
      return false;
    }
    const numValue = parseFloat(inputValue);
    if (isNaN(numValue) || numValue <= 0) {
      return false;
    }
    // Check against total claimable
    const inputInWei = BigInt(Math.floor(numValue * 1e18));
    if (inputInWei > totalClaimable) {
      return false;
    }
    // Check against pool liquidity
    if (inputInWei > poolLiquidity) {
      return false;
    }
    return true;
  }, [inputValue, totalClaimable, poolLiquidity]);

  const handleWithdraw = async () => {
    if (!isValidInput) return;

    setIsProcessing(true);

    try {
      // Parse the input value to bigint with 18 decimals
      const [whole, decimal = ''] = inputValue.split('.');
      const paddedDecimal = decimal.padEnd(18, '0').slice(0, 18);
      const amount = BigInt(whole + paddedDecimal);

      // Mocked withdraw function - replace with actual implementation
      await new Promise((resolve) => setTimeout(resolve, 2000));
      console.log('Withdrawing amount:', amount.toString());

      toast.success(`Successfully withdrew ${inputValue} ${loanPosition.symbol}`);
      onClose();
    } catch (error) {
      console.error('Withdraw error:', error);
      toast.error('Failed to withdraw');
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMaxClick = () => {
    // Max is the minimum of total claimable and pool liquidity
    const maxWithdrawable = totalClaimable < poolLiquidity ? totalClaimable : poolLiquidity;
    setInputValue(formatAmount(maxWithdrawable));
  };

  if (!open || !mounted || !loanPosition) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm overflow-hidden"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isProcessing) {
          onClose();
        }
      }}
    >
      <div className="relative w-full max-w-md bg-surface border border-surface-border rounded-lg shadow-xl mx-4 my-8">
        {isProcessing ? (
          <div className="p-6">
            <div className="border-b border-surface-border pb-6">
              <h2 className="text-xl font-semibold text-white">
                Withdrawing {loanPosition.symbol}...
              </h2>
            </div>
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 animate-spin text-brand-purple mb-4" />
            </div>
          </div>
        ) : (
          <>
            <div className="p-6 border-b border-surface-border">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    Withdraw {loanPosition.symbol}
                  </h2>
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

            <div className="p-6 space-y-6">
              {/* Position Details */}
              <div className="space-y-3 p-4 bg-surface-hover border border-surface-border rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-muted">Principal</span>
                  <span className="text-white font-mono">
                    {formatAmount(principal)} {loanPosition.symbol}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-muted">Interest Earned</span>
                  <span className="text-green-400 font-mono">
                    +{formatAmount(interest)} {loanPosition.symbol}
                  </span>
                </div>
                <div className="border-t border-surface-border pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white">Total Claimable</span>
                    <span className="text-white font-mono font-medium">
                      {formattedTotalClaimable} {loanPosition.symbol}
                    </span>
                  </div>
                </div>
              </div>

              {/* Pool Liquidity */}
              <div className="flex items-center justify-between p-4 bg-surface-hover border border-surface-border rounded-lg">
                <span className="text-sm text-text-muted">Pool Liquidity</span>
                <span className="text-white font-mono">
                  {formatAmount(poolLiquidity)} {loanPosition.symbol}
                </span>
              </div>

              {/* Input Box */}
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
                    className="w-full px-4 py-3 bg-surface-hover border border-surface-border rounded-lg text-white placeholder-text-muted focus:outline-none focus:border-brand-purple transition-colors font-mono text-lg"
                  />
                  <button
                    onClick={handleMaxClick}
                    className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-medium text-brand-purple hover:text-brand-purple-hover transition-colors"
                  >
                    MAX
                  </button>
                </div>
                <div className="text-xs text-text-muted">
                  {loanPosition.symbol}
                </div>
              </div>

              {/* Withdraw Button */}
              <button
                onClick={handleWithdraw}
                disabled={!isValidInput}
                className="w-full px-4 py-3 bg-brand-purple hover:bg-brand-purple-hover text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-brand-purple"
              >
                Withdraw {loanPosition.symbol}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
