'use client';

import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type BorrowModalProps = {
  open: boolean;
  onClose: () => void;
  debtTokenName: string;
  availableToBorrow: bigint;
};

export default function BorrowModal({
  open,
  onClose,
  debtTokenName,
  availableToBorrow,
}: BorrowModalProps) {
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

  const formattedAvailable = useMemo(() => {
    return (Number(availableToBorrow) / 1e18).toFixed(6);
  }, [availableToBorrow]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    // Allow empty string
    if (value === '') {
      setInputValue('');
      return;
    }

    // Allow only numbers and single decimal point
    if (/^\d*\.?\d*$/.test(value)) {
      setInputValue(value);
    }
  };

  const isValidInput = useMemo(() => {
    if (!inputValue || inputValue === '0' || inputValue === '0.' || inputValue === '.') {
      return false;
    }
    const numValue = parseFloat(inputValue);
    return !isNaN(numValue) && numValue > 0;
  }, [inputValue]);

  const handleBorrow = async () => {
    if (!isValidInput) return;

    setIsProcessing(true);

    try {
      // Parse the input value to bigint with 18 decimals
      const [whole, decimal = ''] = inputValue.split('.');
      const paddedDecimal = decimal.padEnd(18, '0').slice(0, 18);
      const amount = BigInt(whole + paddedDecimal);

      // Mock borrow function - replace with actual contract call
      console.log('Borrowing amount:', amount.toString());

      // Simulate async operation
      await new Promise(resolve => setTimeout(resolve, 2000));

      // TODO: Call actual contract method
      // await poolContract.methods.borrow(amount).send();

      toast.success(`Successfully borrowed ${inputValue} ${debtTokenName}`);
      onClose();
    } catch (error) {
      console.error('Borrow error:', error);
      toast.error('Failed to borrow');
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMaxClick = () => {
    setInputValue(formattedAvailable);
  };

  if (!open || !mounted) return null;

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
                Borrowing {debtTokenName}...
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
                    Borrow {debtTokenName}
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
              {/* Borrow APY Display */}
              <div className="flex items-center justify-between p-4 bg-surface-hover border border-surface-border rounded-lg">
                <span className="text-sm text-text-muted">Borrow APY</span>
                <span className="text-sm font-mono text-text-muted font-medium">
                  5.00%
                </span>
              </div>

              {/* Available to Borrow */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-muted">Available to Borrow</span>
                  <span className="text-white font-mono">
                    {formattedAvailable} {debtTokenName}
                  </span>
                </div>
              </div>

              {/* Input Box */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white">
                  Amount to Borrow
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
                  {debtTokenName}
                </div>
              </div>

              {/* Borrow Button */}
              <button
                onClick={handleBorrow}
                disabled={!isValidInput}
                className="w-full px-4 py-3 bg-brand-purple hover:bg-brand-purple-hover text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-brand-purple"
              >
                Borrow {debtTokenName}
              </button>

              {/* Placeholder for additional borrow complexity */}
              {/* TODO: Add collateral requirements, health factor, liquidation risk, etc. */}
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
