'use client';

import { formatCurrency } from '@/lib/utils';
import { ArrowDown, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { useDataContext, MarketWithContract, StableMarketWithContract } from '@/contexts/DataContext';
import { useWallet } from '@/hooks/useWallet';
import { useMemo, useState } from 'react';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import SupplyModal from './SupplyModal';
import BorrowModal from './BorrowModal';
import CollateralizeModal from './CollateralizeModal';
import StableCollateralizeModal from './StableCollateralizeModal';
import StableBorrowModal from './StableBorrowModal';
import { MarketType } from './MarketsContent';

function calculateUtilization(supplied: bigint, borrowed: bigint): number {
  if (supplied === 0n) return 0;
  return Number((borrowed * 100n) / supplied);
}

// Convert token amount to USD value
// amount is in 18 decimals, price is in 1e4 scale
function tokenAmountToUSD(amount: bigint, price: bigint | undefined): number {
  if (!price) return 0;
  // amount / 1e18 * price / 1e4 = (amount * price) / 1e22
  return Number((amount * price)) / 1e22;
}

interface MarketTableProps {
  marketType: MarketType;
}

export default function MarketTable({ marketType }: MarketTableProps) {
  const { contracts, wallet: walletHandle, activeAccount } = useWallet();
  const { markets, prices, marketConfigs, stableMarkets, stableMarketConfigs } = useDataContext();

  const [supplyModalOpen, setSupplyModalOpen] = useState(false);
  const [borrowModalOpen, setBorrowModalOpen] = useState(false);
  const [collateralizeModalOpen, setCollateralizeModalOpen] = useState(false);
  const [selectedMarket, setSelectedMarket] = useState<MarketWithContract | null>(null);

  // Stable market modal state
  const [stableCollateralizeModalOpen, setStableCollateralizeModalOpen] = useState(false);
  const [stableBorrowModalOpen, setStableBorrowModalOpen] = useState(false);
  const [selectedStableMarket, setSelectedStableMarket] = useState<StableMarketWithContract | null>(null);

  // Extract wallet instance and address
  const wallet = useMemo(() => walletHandle?.instance, [walletHandle]);
  const address = useMemo(() =>
    activeAccount?.address ? AztecAddress.fromString(activeAccount.address) : undefined,
    [activeAccount?.address]
  );

  // Filter markets based on marketType
  const filteredDebtMarkets = useMemo(() => {
    if (marketType === 'all' || marketType === 'debt') {
      return marketConfigs;
    }
    return [];
  }, [marketType, marketConfigs]);

  const filteredStableMarkets = useMemo(() => {
    if (marketType === 'all' || marketType === 'stables') {
      return stableMarketConfigs;
    }
    return [];
  }, [marketType, stableMarketConfigs]);

  const totalFilteredCount = filteredDebtMarkets.length + filteredStableMarkets.length;

  // Whether to show all columns (for 'all' and 'debt' views)
  const showAllColumns = marketType === 'all' || marketType === 'debt';

  const handleSupplyClick = (market: MarketWithContract) => {
    setSelectedMarket(market);
    setSupplyModalOpen(true);
  };

  const handleBorrowClick = (market: MarketWithContract) => {
    setSelectedMarket(market);
    setBorrowModalOpen(true);
  };

  const handleCollateralizeClick = (market: MarketWithContract) => {
    setSelectedMarket(market);
    setCollateralizeModalOpen(true);
  };

  // Stable market handlers
  const handleStableCollateralizeClick = (market: StableMarketWithContract) => {
    setSelectedStableMarket(market);
    setStableCollateralizeModalOpen(true);
  };

  const handleStableBorrowClick = (market: StableMarketWithContract) => {
    setSelectedStableMarket(market);
    setStableBorrowModalOpen(true);
  };

  return (
    <>
      <div className="w-full overflow-x-auto rounded-xl border border-surface-border bg-surface">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-surface-border text-xs text-text-muted uppercase tracking-wider">
              <th className="py-4 px-6 font-medium">Market Pair</th>
              {showAllColumns && (
                <th className="py-4 px-6 font-medium text-right cursor-pointer hover:text-white transition-colors group">
                  Supply APY <ArrowDown className="inline w-3 h-3 ml-1 opacity-0 group-hover:opacity-100" />
                </th>
              )}
              <th className="py-4 px-6 font-medium text-right cursor-pointer hover:text-white transition-colors group">
                Borrow APY <ArrowDown className="inline w-3 h-3 ml-1 opacity-0 group-hover:opacity-100" />
              </th>
              <th className="py-4 px-6 font-medium text-right hidden md:table-cell">Total Supply</th>
              {showAllColumns && (
                <th className="py-4 px-6 font-medium text-right hidden md:table-cell">Total Borrow</th>
              )}
              {showAllColumns && (
                <th className="py-4 px-6 font-medium text-right w-48">Utilization</th>
              )}
              <th className="py-4 px-6 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border text-sm">
            {/* Loading state - show spinner while contracts are loading */}
            {((marketType === 'all' && marketConfigs.length === 0 && stableMarketConfigs.length === 0) ||
              (marketType === 'debt' && marketConfigs.length === 0) ||
              (marketType === 'stables' && stableMarketConfigs.length === 0)) && (
              <tr>
                <td colSpan={showAllColumns ? 7 : 4} className="py-12 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-brand-purple mx-auto" />
                </td>
              </tr>
            )}
            {/* Empty state - show when contracts loaded but no markets */}
            {totalFilteredCount === 0 &&
              ((marketType === 'all' && (marketConfigs.length > 0 || stableMarketConfigs.length > 0)) ||
               (marketType === 'debt' && marketConfigs.length > 0) ||
               (marketType === 'stables' && stableMarketConfigs.length > 0)) && (
              <tr>
                <td colSpan={showAllColumns ? 7 : 4} className="py-12 text-center text-text-muted">
                  {marketType === 'stables'
                    ? 'No stable pools available yet. Coming soon!'
                    : 'No markets available'}
                </td>
              </tr>
            )}
            {/* Debt Markets */}
            {filteredDebtMarkets.map((market) => {
              const marketData = markets.get(market.poolAddress);

              const utilization = marketData?.status === 'loaded' && marketData.data
                ? calculateUtilization(marketData.data.totalSupplied, marketData.data.totalBorrowed)
                : 0;

              // Get the token address for this market's loan asset
              const loanTokenAddress = market.loanAsset === 'USDC'
                ? contracts?.tokens.usdc.address.toString()
                : contracts?.tokens.zec.address.toString();

              const tokenPrice = loanTokenAddress ? prices.get(loanTokenAddress)?.price : undefined;

              return (
                <tr key={market.id} className="group hover:bg-surface-hover/50 transition-colors border-b border-surface-border last:border-0">
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <div className="relative flex -space-x-2">
                        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center border-2 border-surface z-10 overflow-hidden">
                          <Image
                            src={`/icons/${market.loanAsset.toLowerCase()}.svg`}
                            alt={market.loanAsset}
                            width={32}
                            height={32}
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center border-2 border-surface z-0 opacity-80 overflow-hidden">
                          <Image
                            src={`/icons/${market.collateralAsset.toLowerCase()}.svg`}
                            alt={market.collateralAsset}
                            width={32}
                            height={32}
                            className="w-full h-full object-contain"
                          />
                        </div>
                      </div>
                      <div>
                        <div className="font-medium text-white">{market.loanAsset} / {market.collateralAsset}</div>
                        <div className="text-xs text-text-muted font-mono">Isolated</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <span className="font-mono text-text-muted font-medium">{market.supplyApy.toFixed(2)}%</span>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium bg-green-900/30 text-green-400 border border-green-900/50">
                      {market.borrowApy.toFixed(2)}%
                    </span>
                  </td>
                  <td className="py-4 px-6 text-right hidden md:table-cell font-mono text-text-muted">
                    {marketData?.status === 'loading' && (
                      <Loader2 className="w-4 h-4 animate-spin inline-block" />
                    )}
                    {marketData?.status === 'loaded' && marketData.data && (
                      formatCurrency(tokenAmountToUSD(marketData.data.totalSupplied, tokenPrice))
                    )}
                    {marketData?.status === 'error' && (
                      <span className="text-red-400">Error</span>
                    )}
                  </td>
                  <td className="py-4 px-6 text-right hidden md:table-cell font-mono text-text-muted">
                    {marketData?.status === 'loading' && (
                      <Loader2 className="w-4 h-4 animate-spin inline-block" />
                    )}
                    {marketData?.status === 'loaded' && marketData.data && (
                      formatCurrency(tokenAmountToUSD(marketData.data.totalBorrowed, tokenPrice))
                    )}
                    {marketData?.status === 'error' && (
                      <span className="text-red-400">Error</span>
                    )}
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="flex flex-col items-end gap-1">
                      {marketData?.status === 'loading' && (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      )}
                      {marketData?.status === 'loaded' && (
                        <>
                          <span className="text-xs font-mono text-text-muted">{utilization.toFixed(1)}%</span>
                          <div className="w-24 h-1.5 bg-surface-border rounded-full overflow-hidden">
                            <div className="h-full bg-brand-purple rounded-full" style={{ width: `${utilization}%` }}></div>
                          </div>
                        </>
                      )}
                      {marketData?.status === 'error' && (
                        <span className="text-red-400 text-xs">Error</span>
                      )}
                    </div>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="flex justify-end gap-2 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleSupplyClick(market)}
                        className="px-3 py-1.5 text-xs font-medium bg-transparent hover:bg-surface-border text-text-muted hover:text-white border border-surface-border rounded transition-colors"
                      >
                        Supply
                      </button>
                      <button
                        onClick={() => handleCollateralizeClick(market)}
                        className="px-3 py-1.5 text-xs font-medium bg-transparent hover:bg-surface-border text-text-muted hover:text-white border border-surface-border rounded transition-colors"
                      >
                        Collateralize
                      </button>
                      <button
                        onClick={() => handleBorrowClick(market)}
                        className="px-3 py-1.5 text-xs font-medium bg-brand-purple hover:bg-brand-purple-hover text-white rounded border border-transparent transition-colors"
                      >
                        Borrow
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {/* Stable Markets */}
            {filteredStableMarkets.map((market) => {
              const stableMarketData = stableMarkets.get(market.poolAddress);

              return (
                <tr key={market.id} className="group hover:bg-surface-hover/50 transition-colors border-b border-surface-border last:border-0">
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <div className="relative flex -space-x-2">
                        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center border-2 border-surface z-10 overflow-hidden">
                          <Image
                            src={`/icons/${market.stablecoin.toLowerCase()}.svg`}
                            alt={market.stablecoin}
                            width={32}
                            height={32}
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center border-2 border-surface z-0 opacity-80 overflow-hidden">
                          <Image
                            src={`/icons/${market.collateralAsset.toLowerCase()}.svg`}
                            alt={market.collateralAsset}
                            width={32}
                            height={32}
                            className="w-full h-full object-contain"
                          />
                        </div>
                      </div>
                      <div>
                        <div className="font-medium text-white">{market.stablecoin} / {market.collateralAsset}</div>
                        <div className="text-xs text-text-muted font-mono">Stablecoin</div>
                      </div>
                    </div>
                  </td>
                  {/* Supply APY - N/A for stable markets */}
                  {showAllColumns && (
                    <td className="py-4 px-6 text-right">
                      <span className="text-xs font-mono text-text-muted/50">N/A</span>
                    </td>
                  )}
                  <td className="py-4 px-6 text-right">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium bg-green-900/30 text-green-400 border border-green-900/50">
                      {market.borrowApy.toFixed(2)}%
                    </span>
                  </td>
                  <td className="py-4 px-6 text-right hidden md:table-cell font-mono text-text-muted">
                    {(!stableMarketData || stableMarketData.status === 'loading') && (
                      <Loader2 className="w-4 h-4 animate-spin inline-block" />
                    )}
                    {stableMarketData?.status === 'loaded' && stableMarketData.data && (
                      formatCurrency(tokenAmountToUSD(stableMarketData.data.totalSupplied, 10000n)) // zUSD is $1
                    )}
                    {stableMarketData?.status === 'error' && (
                      <span className="text-red-400">Error</span>
                    )}
                  </td>
                  {/* Total Borrow - N/A for stable markets */}
                  {showAllColumns && (
                    <td className="py-4 px-6 text-right hidden md:table-cell">
                      <span className="text-xs font-mono text-text-muted/50">N/A</span>
                    </td>
                  )}
                  {/* Utilization - N/A for stable markets */}
                  {showAllColumns && (
                    <td className="py-4 px-6 text-right">
                      <span className="text-xs font-mono text-text-muted/50">N/A</span>
                    </td>
                  )}
                  <td className="py-4 px-6 text-right">
                    <div className="flex justify-end gap-2 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleStableCollateralizeClick(market)}
                        className="px-3 py-1.5 text-xs font-medium bg-transparent hover:bg-surface-border text-text-muted hover:text-white border border-surface-border rounded transition-colors"
                      >
                        Collateralize
                      </button>
                      <button
                        onClick={() => handleStableBorrowClick(market)}
                        className="px-3 py-1.5 text-xs font-medium bg-brand-purple hover:bg-brand-purple-hover text-white rounded border border-transparent transition-colors"
                      >
                        Mint
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-6 text-sm text-text-muted">
        <span>Showing {totalFilteredCount > 0 ? 1 : 0} to {totalFilteredCount} of {totalFilteredCount} markets</span>
        <div className="flex gap-2">
          <button className="w-8 h-8 rounded border border-surface-border flex items-center justify-center hover:bg-surface-hover hover:text-white disabled:opacity-50" disabled>
            <ArrowDown className="w-4 h-4 rotate-90" />
          </button>
          <button className="w-8 h-8 rounded border border-surface-border flex items-center justify-center hover:bg-surface-hover hover:text-white">
            <ArrowDown className="w-4 h-4 -rotate-90" />
          </button>
        </div>
      </div>

      {/* Modals */}
      {selectedMarket && contracts && (
        <>
          <SupplyModal
            open={supplyModalOpen}
            onClose={() => setSupplyModalOpen(false)}
            debtTokenName={selectedMarket.loanAsset}
            tokenContract={
              selectedMarket.loanAsset === 'USDC'
                ? contracts.tokens.usdc
                : contracts.tokens.zec
            }
            poolContract={selectedMarket.contract}
            wallet={wallet}
            userAddress={address}
          />
          <CollateralizeModal
            open={collateralizeModalOpen}
            onClose={() => setCollateralizeModalOpen(false)}
            collateralTokenName={selectedMarket.collateralAsset}
            collateralTokenContract={
              selectedMarket.collateralAsset === 'USDC'
                ? contracts.tokens.usdc
                : contracts.tokens.zec
            }
            debtTokenAddress={
              selectedMarket.loanAsset === 'USDC'
                ? contracts.tokens.usdc.address
                : contracts.tokens.zec.address
            }
            poolContract={selectedMarket.contract}
            wallet={wallet}
            userAddress={address}
          />
          <BorrowModal
            open={borrowModalOpen}
            onClose={() => setBorrowModalOpen(false)}
            market={selectedMarket}
            wallet={wallet}
            userAddress={address}
          />
        </>
      )}

      {/* Stable Market Modals */}
      {selectedStableMarket && contracts && (
        <>
          <StableCollateralizeModal
            open={stableCollateralizeModalOpen}
            onClose={() => setStableCollateralizeModalOpen(false)}
            collateralTokenName={selectedStableMarket.collateralAsset}
            collateralTokenContract={
              selectedStableMarket.collateralAsset === 'ZEC'
                ? contracts.tokens.zec
                : contracts.tokens.usdc
            }
            stableTokenAddress={contracts.tokens.zusd.address}
            poolContract={selectedStableMarket.contract}
            wallet={wallet}
            userAddress={address}
          />
          <StableBorrowModal
            open={stableBorrowModalOpen}
            onClose={() => setStableBorrowModalOpen(false)}
            market={selectedStableMarket}
            wallet={wallet}
            userAddress={address}
          />
        </>
      )}
    </>
  );
}
