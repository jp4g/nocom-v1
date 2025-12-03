'use client';

import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { BaseWallet } from '@aztec/aztec.js/wallet';
import { TokenContract, NocomLendingPoolV1Contract } from '@nocom-v1/contracts/artifacts';
import { useBalance } from '@/hooks/useBalance';
import { useEscrow } from '@/hooks/useEscrow';
import { setEscrowData } from '@/lib/storage/escrowStorage';
import { deployEscrowContract, depositCollateral } from '@nocom-v1/contracts/contract';
import { simulationQueue } from '@/lib/utils/simulationQueue';
import { parseTokenAmount } from '@/lib/utils';
import { useDataContext } from '@/contexts/DataContext';
import { USDC_LTV, ZCASH_LTV } from '@nocom-v1/contracts/constants';

type CollateralizeModalProps = {
  open: boolean;
  onClose: () => void;
  collateralTokenName: string;
  loanAsset: string;
  collateralTokenContract: TokenContract;
  debtTokenAddress: AztecAddress;
  poolContract: NocomLendingPoolV1Contract;
  wallet: BaseWallet | undefined;
  userAddress: AztecAddress | undefined;
};

export default function CollateralizeModal({
  open,
  onClose,
  collateralTokenName,
  loanAsset,
  collateralTokenContract,
  debtTokenAddress,
  poolContract,
  wallet,
  userAddress,
}: CollateralizeModalProps) {
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<string>('');
  const [mounted, setMounted] = useState(false);

  const { optimisticCollateralize, prices } = useDataContext();

  // Fetch user's balance for the collateral token
  const { balance, isLoading: isBalanceLoading, error: balanceError } = useBalance(
    collateralTokenContract,
    wallet,
    userAddress
  );

  // Check for existing escrow contract
  const { escrowContract, isLoading: isEscrowLoading, refetch: refetchEscrow } = useEscrow(
    poolContract?.address.toString()
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

  const ensureEscrowDeployed = async () => {
    if (!wallet || !userAddress || !poolContract) {
      throw new Error('Missing required parameters');
    }

    // If escrow already exists, return it
    if (escrowContract) {
      console.log('[CollateralizeModal] Using existing escrow:', escrowContract.address.toString());
      return escrowContract;
    }

    console.log('[CollateralizeModal] No escrow found - deploying new escrow');
    setProcessingStep('Creating private escrow...');

    // Deploy escrow contract via simulation queue to prevent IndexedDB transaction conflicts
    const { contract, secretKey } = await simulationQueue.enqueue(() =>
      deployEscrowContract(
        wallet,
        userAddress,
        poolContract.address,
        collateralTokenContract.address,
        debtTokenAddress,
        true // auto approve registration for now
      )
    );
    const escrowAddress = contract.address.toString();

    console.log('[CollateralizeModal] Escrow deployed:', escrowAddress);

    // Step 2: Call API to register escrow (still part of creating private escrow)
    // Keep the same message for seamless UX
    const apiResponse = await fetch('/api/register-escrow', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        escrowAddress,
        debtPoolAddress: poolContract.address.toString(),
        secretKey: secretKey.toString(),
      }),
    });

    if (!apiResponse.ok) {
      throw new Error('Failed to register escrow with API');
    }

    console.log('[CollateralizeModal] Escrow registered with API');

    // Step 3: Store in local storage (per-user) with secretKey and instance for re-registration on reload
    if (!userAddress) {
      throw new Error('User address not available');
    }
    const instanceString = JSON.stringify(contract.instance);
    setEscrowData(userAddress.toString(), poolContract.address.toString(), escrowAddress, secretKey.toString(), instanceString);
    console.log('[CollateralizeModal] Escrow stored in local storage');

    // Step 4: Refetch to update the cache and return the contract
    await refetchEscrow();
    console.log('[CollateralizeModal] Escrow cache updated');

    // Return the deployed contract directly
    return contract;
  };

  const handleCollateralize = async () => {
    if (!isValidInput || !wallet || !userAddress || !poolContract || !collateralTokenContract) return;

    setIsProcessing(true);

    try {
      const amount = parseTokenAmount(inputValue);

      // Step 1: Ensure escrow is deployed (returns the contract instance)
      const escrowContractInstance = await ensureEscrowDeployed();
      console.log('Using escrow contract:', escrowContractInstance.address.toString());

      // Step 2: Collateralize via simulation queue to prevent IndexedDB transaction conflicts
      setProcessingStep(`Collateralizing ${collateralTokenName}...`);
      const txReceipt = await simulationQueue.enqueue(() =>
        depositCollateral(
          wallet,
          userAddress,
          escrowContractInstance,
          collateralTokenContract,
          amount
        )
      );
      console.log('Collateralization transaction receipt:', txReceipt);

      // Apply optimistic update
      const tokenAddress = collateralTokenContract.address.toString();
      const priceState = prices.get(tokenAddress);
      const tokenPrice = priceState?.status === 'loaded' && priceState.price ? priceState.price : 10000n;
      const collateralFactor = collateralTokenName.toUpperCase() === 'USDC'
        ? Number(USDC_LTV) / 100000
        : Number(ZCASH_LTV) / 100000;

      optimisticCollateralize({
        poolAddress: poolContract.address.toString(),
        amount,
        loanAsset,
        collateralAsset: collateralTokenName,
        tokenPrice,
        collateralFactor,
        isStable: false,
      });

      toast.success(`Successfully collateralized ${inputValue} ${collateralTokenName}`);
      onClose();
    } catch (error) {
      console.error('Collateralize error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to collateralize');
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
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
                Collateralizing {collateralTokenName}...
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
            <div className="p-6 border-b border-surface-border">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    Collateralize {collateralTokenName}
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
              {/* First-time setup notice */}
              {!isEscrowLoading && !escrowContract && (
                <div className="p-4 bg-blue-900/20 border border-blue-900/50 rounded-lg">
                  <p className="text-sm text-blue-400">
                    <strong>First-time setup:</strong> An escrow contract will be deployed for this market on your first collateralization.
                  </p>
                </div>
              )}

              {/* APY Display */}
              <div className="flex items-center justify-between p-4 bg-surface-hover border border-surface-border rounded-lg">
                <span className="text-sm text-text-muted">Collateral APY</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-sm font-mono font-medium bg-green-900/30 text-green-400 border border-green-900/50">
                  2.50%
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
                      {formattedBalance} {collateralTokenName}
                    </span>
                  )}
                </div>
              </div>

              {/* Input Box */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white">
                  Amount to Collateralize
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
                  {collateralTokenName}
                </div>
              </div>

              {/* Collateralize Button */}
              <button
                onClick={handleCollateralize}
                disabled={!isValidInput}
                className="w-full px-4 py-3 bg-brand-purple hover:bg-brand-purple-hover text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-brand-purple"
              >
                Collateralize {collateralTokenName}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
