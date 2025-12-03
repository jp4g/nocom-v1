'use client';

import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { BaseWallet } from '@aztec/aztec.js/wallet';
import { TokenContract, NocomLendingPoolV1Contract } from '@nocom-v1/contracts/artifacts';
import { useBalance } from '@/hooks/useBalance';
import { supplyLiquidity } from '@nocom-v1/contracts/contract';
import { simulationQueue } from '@/lib/utils/simulationQueue';
import { parseTokenAmount } from '@/lib/utils';
import { useWallet } from '@/hooks/useWallet';
import { useDataContext } from '@/contexts/DataContext';

type SupplyModalProps = {
  open: boolean;
  onClose: () => void;
  debtTokenName: string;
  collateralAsset: string;
  tokenContract: TokenContract;
  poolContract: NocomLendingPoolV1Contract;
  wallet: BaseWallet | undefined;
  userAddress: AztecAddress | undefined;
};

export default function SupplyModal({
  open,
  onClose,
  debtTokenName,
  collateralAsset,
  tokenContract,
  poolContract,
  wallet,
  userAddress,
}: SupplyModalProps) {
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Get trackSuppliedPool from wallet context
  const { trackSuppliedPool } = useWallet();

  // Get optimistic update function and prices from data context
  const { optimisticSupply, prices } = useDataContext();

  // Fetch user's balance for this token
  const { balance, isLoading: isBalanceLoading, error: balanceError } = useBalance(
    tokenContract,
    wallet,
    userAddress
  );

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

  const formattedBalance = useMemo(() => {
    if (!balance) return '0.000000';
    return (Number(balance) / 1e18).toFixed(6);
  }, [balance]);

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
    // Can't submit if balance hasn't loaded yet
    if (isBalanceLoading || !balance) {
      return false;
    }
    if (!inputValue || inputValue === '0' || inputValue === '0.' || inputValue === '.') {
      return false;
    }
    const numValue = parseFloat(inputValue);
    return !isNaN(numValue) && numValue > 0;
  }, [inputValue, isBalanceLoading, balance]);

  const handleSupply = async () => {
    if (!isValidInput || !wallet || !userAddress || !poolContract || !tokenContract) return;

    setIsProcessing(true);

    try {
      const amount = parseTokenAmount(inputValue);
      console.log('Supplying amount:', amount.toString());
      console.log("poolContract:", poolContract.address.toString());
      console.log("tokenContract:", tokenContract.address.toString());
      // Call supply function via simulation queue to prevent IndexedDB transaction conflicts
      const txReceipt = await simulationQueue.enqueue(() =>
        supplyLiquidity(
          wallet,
          userAddress,
          poolContract,
          tokenContract,
          amount
        )
      );
      // return
      console.log('Supply transaction receipt:', txReceipt);

      // Track this pool as one the user has supplied to
      trackSuppliedPool(poolContract.address.toString());

      // Apply optimistic update
      const tokenAddress = tokenContract.address.toString();
      const priceState = prices.get(tokenAddress);
      const tokenPrice = priceState?.status === 'loaded' && priceState.price ? priceState.price : 10000n;

      optimisticSupply({
        poolAddress: poolContract.address.toString(),
        amount,
        loanAsset: debtTokenName,
        collateralAsset,
        tokenPrice,
      });

      toast.success(`Successfully supplied ${inputValue} ${debtTokenName}`);
      onClose();
    } catch (error) {
      console.error('Supply error:', error);
      toast.error('Failed to supply collateral');
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMaxClick = () => {
    setInputValue(formattedBalance);
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
                Supplying {debtTokenName} collateral...
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
                    Supply {debtTokenName}
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
              {/* APY Display */}
              <div className="flex items-center justify-between p-4 bg-surface-hover border border-surface-border rounded-lg">
                <span className="text-sm text-text-muted">Supply APY</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-sm font-mono font-medium bg-green-900/30 text-green-400 border border-green-900/50">
                  4.00%
                </span>
              </div>

              {/* Available Balance */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-muted">Available Balance</span>
                  {isBalanceLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-brand-purple" />
                  ) : balanceError ? (
                    <span className="text-red-400 text-xs">Error loading balance</span>
                  ) : (
                    <span className="text-white font-mono">
                      {formattedBalance} {debtTokenName}
                    </span>
                  )}
                </div>
              </div>

              {/* Input Box */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white">
                  Amount to Supply
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

              {/* Supply Button */}
              <button
                onClick={handleSupply}
                disabled={!isValidInput}
                className="w-full px-4 py-3 bg-brand-purple hover:bg-brand-purple-hover text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-brand-purple"
              >
                Supply {debtTokenName}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
