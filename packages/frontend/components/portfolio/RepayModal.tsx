'use client';

import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { BaseWallet } from '@aztec/aztec.js/wallet';
import { NocomEscrowV1Contract, TokenContract } from '@nocom-v1/contracts/artifacts';
import { DebtPosition } from '@/contexts/DataContext';
import { parseTokenAmount } from '@/lib/utils';
import { repayDebt } from '@nocom-v1/contracts/contract';
import { simulationQueue } from '@/lib/utils/simulationQueue';
import { useBalance } from '@/hooks/useBalance';

type RepayModalProps = {
  open: boolean;
  onClose: () => void;
  debtPosition: DebtPosition | null;
  escrowContract: NocomEscrowV1Contract | undefined;
  debtTokenContract: TokenContract | undefined;
  poolAddress: AztecAddress | undefined;
  wallet: BaseWallet | undefined;
  userAddress: AztecAddress | undefined;
};

export default function RepayModal({
  open,
  onClose,
  debtPosition,
  escrowContract,
  debtTokenContract,
  poolAddress,
  wallet,
  userAddress,
}: RepayModalProps) {
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Fetch user's wallet balance for the debt token
  const { balance: walletBalance, isLoading: isBalanceLoading } = useBalance(
    debtTokenContract,
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

  // Format amounts from bigint (18 decimals) to display string
  const formatAmount = (amount: bigint): string => {
    if (amount === 0n) return '0.000000';
    return (Number(amount) / 1e18).toFixed(6);
  };

  // Format full precision for max repay
  const formatFullPrecision = (amount: bigint): string => {
    const str = amount.toString().padStart(19, '0');
    const whole = str.slice(0, -18) || '0';
    const decimal = str.slice(-18);
    const trimmedDecimal = decimal.replace(/0+$/, '') || '0';
    return `${whole}.${trimmedDecimal}`;
  };

  const principal = useMemo(() => debtPosition?.principal ?? 0n, [debtPosition?.principal]);
  const interest = useMemo(() => debtPosition?.interest ?? 0n, [debtPosition?.interest]);
  const totalDebt = useMemo(() => debtPosition?.balance ?? 0n, [debtPosition?.balance]);
  const formattedDebt = useMemo(() => formatAmount(totalDebt), [totalDebt]);
  const formattedWalletBalance = useMemo(() => formatAmount(walletBalance ?? 0n), [walletBalance]);

  // Max repayable is the minimum of debt and wallet balance
  const maxRepayable = useMemo(() => {
    if (!walletBalance) return totalDebt;
    return totalDebt < walletBalance ? totalDebt : walletBalance;
  }, [totalDebt, walletBalance]);

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
    try {
      const amount = parseTokenAmount(inputValue);
      if (amount <= 0n) return false;
      if (amount > totalDebt) return false;
      if (walletBalance && amount > walletBalance) return false;
      return true;
    } catch {
      return false;
    }
  }, [inputValue, totalDebt, walletBalance]);

  const handleRepay = async () => {
    if (!isValidInput || !wallet || !userAddress || !escrowContract || !debtTokenContract || !poolAddress) return;

    setIsProcessing(true);

    try {
      const amount = parseTokenAmount(inputValue);
      console.log('Repaying amount:', amount.toString());

      const txReceipt = await simulationQueue.enqueue(() =>
        repayDebt(
          wallet,
          userAddress,
          escrowContract,
          debtTokenContract,
          poolAddress,
          amount
        )
      );
      console.log('Repay transaction receipt:', txReceipt);

      toast.success(`Successfully repaid ${inputValue} ${debtPosition?.symbol}`);
      onClose();
    } catch (error) {
      console.error('Repay error:', error);
      toast.error('Failed to repay debt');
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMaxClick = () => {
    setInputValue(formatFullPrecision(maxRepayable));
  };

  if (!open || !mounted || !debtPosition) return null;

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
                Repaying {debtPosition.symbol}...
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
                    Repay {debtPosition.symbol}
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
                    {formatAmount(principal)} {debtPosition.symbol}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-muted">Interest Owed</span>
                  <span className="text-red-400 font-mono">
                    {formatAmount(interest)} {debtPosition.symbol}
                  </span>
                </div>
                <div className="border-t border-surface-border pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white">Total Obligation</span>
                    <span className="text-white font-mono font-medium">
                      {formattedDebt} {debtPosition.symbol}
                    </span>
                  </div>
                </div>
              </div>

              {/* Wallet Balance */}
              <div className="flex items-center justify-between p-4 bg-surface-hover border border-surface-border rounded-lg">
                <span className="text-sm text-text-muted">Wallet Balance</span>
                {isBalanceLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-brand-purple" />
                ) : (
                  <span className="text-white font-mono">
                    {formattedWalletBalance} {debtPosition.symbol}
                  </span>
                )}
              </div>

              {/* Insufficient Balance Warning */}
              {walletBalance !== undefined && walletBalance < totalDebt && (
                <div className="p-3 bg-yellow-900/20 border border-yellow-900/50 rounded-lg">
                  <p className="text-sm text-yellow-400">
                    Your wallet balance is less than your total debt. You can make a partial repayment.
                  </p>
                </div>
              )}

              {/* Input Box */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white">
                  Amount to Repay
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
                  {debtPosition.symbol}
                </div>
              </div>

              {/* Repay Button */}
              <button
                onClick={handleRepay}
                disabled={!isValidInput || !escrowContract}
                className="w-full px-4 py-3 bg-brand-purple hover:bg-brand-purple-hover text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-brand-purple"
              >
                {!escrowContract ? (
                  'No Escrow Found'
                ) : (
                  `Repay ${debtPosition.symbol}`
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
