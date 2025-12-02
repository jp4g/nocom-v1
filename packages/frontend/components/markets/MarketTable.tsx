'use client';

import { MARKET_DATA } from '@/lib/mockData';
import { formatCurrency } from '@/lib/utils';
import { ArrowDown, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { useMarketData, MarketWithContract } from '@/hooks/useMarketData';
import { usePriceOracle } from '@/hooks/usePriceOracle';
import { useWallet } from '@/hooks/useWallet';
import { useMemo, useState } from 'react';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import SupplyModal from './SupplyModal';
import BorrowModal from './BorrowModal';

function calculateUtilization(supplied: bigint, borrowed: bigint): number {
  if (supplied === 0n) return 0;
  return Number((borrowed * 100n) / supplied);
}

// Scale token amounts from 18 decimals to regular numbers
function scaleTokenAmount(amount: bigint): number {
  return Number(amount) / 1e18;
}

// Convert token amount to USD value
// amount is in 18 decimals, price is in 1e4 scale
function tokenAmountToUSD(amount: bigint, price: bigint | undefined): number {
  if (!price) return 0;
  // amount / 1e18 * price / 1e4 = (amount * price) / 1e22
  return Number((amount * price)) / 1e22;
}

export default function MarketTable() {
  const { contracts, wallet: walletHandle, activeAccount } = useWallet();
  const [supplyModalOpen, setSupplyModalOpen] = useState(false);
  const [borrowModalOpen, setBorrowModalOpen] = useState(false);
  const [selectedMarket, setSelectedMarket] = useState<MarketWithContract | null>(null);

  // Extract wallet instance and address
  const wallet = useMemo(() => walletHandle?.instance, [walletHandle]);
  const address = useMemo(() =>
    activeAccount?.address ? AztecAddress.fromString(activeAccount.address) : undefined,
    [activeAccount?.address]
  );

  // Build market configs with contract instances
  const marketConfigs = useMemo(() => {
    if (!contracts) return [];

    const configs = [
      {
        id: contracts.pools.usdcToZec.address.toString(),
        loanAsset: 'ZEC', // This pool holds ZEC (zecDebtPool)
        collateralAsset: 'USDC',
        poolAddress: contracts.pools.usdcToZec.address.toString(),
        supplyApy: 4.00,
        borrowApy: 5.00,
        totalSupply: 0, // Will be filled by useMarketData
        totalBorrow: 0, // Will be filled by useMarketData
        utilization: 0, // Will be calculated from fetched data
        contract: contracts.pools.usdcToZec,
      },
      {
        id: contracts.pools.zecToUsdc.address.toString(),
        loanAsset: 'USDC', // This pool holds USDC (usdcDebtPool)
        collateralAsset: 'ZEC',
        poolAddress: contracts.pools.zecToUsdc.address.toString(),
        supplyApy: 4.00,
        borrowApy: 5.00,
        totalSupply: 0, // Will be filled by useMarketData
        totalBorrow: 0, // Will be filled by useMarketData
        utilization: 0, // Will be calculated from fetched data
        contract: contracts.pools.zecToUsdc,
      }
    ];

    console.log('[MarketTable] Market configurations:', configs.map(c => ({
      loanAsset: c.loanAsset,
      collateralAsset: c.collateralAsset,
      poolAddress: c.poolAddress,
    })));

    // Log the actual pool mapping
    if (contracts) {
      console.log('[MarketTable] Pool address mapping:', {
        'contracts.pools.usdcToZec': contracts.pools.usdcToZec.address.toString(),
        'contracts.pools.zecToUsdc': contracts.pools.zecToUsdc.address.toString(),
        'USDC token': contracts.tokens.usdc.address.toString(),
        'ZEC token': contracts.tokens.zec.address.toString(),
      });
    }

    return configs;
  }, [contracts]);

  // Fetch token prices
  const tokenPrices = useMemo(() => {
    if (!contracts) return [];
    return [
      { address: contracts.tokens.usdc.address, symbol: 'USDC' },
      { address: contracts.tokens.zec.address, symbol: 'ZEC' },
    ];
  }, [contracts]);

  const { prices } = usePriceOracle(
    tokenPrices,
    contracts?.oracle,
    // @ts-ignore
    wallet,
    address
  );

  // @ts-ignore
  const { markets } = useMarketData(marketConfigs, wallet, address);

  // Log prices when they load
  console.log('[MarketTable] Token prices:', {
    USDC: prices.get(tokenPrices[0]?.address.toString())?.price?.toString(),
    ZEC: prices.get(tokenPrices[1]?.address.toString())?.price?.toString(),
  });

  const handleSupplyClick = (market: MarketWithContract) => {
    setSelectedMarket(market);
    setSupplyModalOpen(true);
  };

  const handleBorrowClick = (market: MarketWithContract) => {
    setSelectedMarket(market);
    setBorrowModalOpen(true);
  };

  const handleSupply = async (amount: bigint) => {
    // Mock supply function - replace with actual contract call
    console.log('Supplying amount:', amount.toString());

    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 2000));

    // TODO: Call actual contract method
    // await selectedMarket.contract.methods.supply(amount).send();
  };

  const handleBorrow = async (amount: bigint) => {
    // Mock borrow function - replace with actual contract call
    console.log('Borrowing amount:', amount.toString());

    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 2000));

    // TODO: Call actual contract method
    // await selectedMarket.contract.methods.borrow(amount).send();
  };

  return (
    <>
      <div className="w-full overflow-x-auto rounded-xl border border-surface-border bg-surface">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-surface-border text-xs text-text-muted uppercase tracking-wider">
              <th className="py-4 px-6 font-medium">Market Pair</th>
              <th className="py-4 px-6 font-medium text-right cursor-pointer hover:text-white transition-colors group">
                Supply APY <ArrowDown className="inline w-3 h-3 ml-1 opacity-0 group-hover:opacity-100" />
              </th>
              <th className="py-4 px-6 font-medium text-right cursor-pointer hover:text-white transition-colors group">
                Borrow APY <ArrowDown className="inline w-3 h-3 ml-1 opacity-0 group-hover:opacity-100" />
              </th>
              <th className="py-4 px-6 font-medium text-right hidden md:table-cell">Total Supply</th>
              <th className="py-4 px-6 font-medium text-right hidden md:table-cell">Total Borrow</th>
              <th className="py-4 px-6 font-medium text-right w-48">Utilization</th>
              <th className="py-4 px-6 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border text-sm">
            {marketConfigs.map((market) => {
              const marketData = markets.get(market.poolAddress);

              const utilization = marketData?.status === 'loaded' && marketData.data
                ? calculateUtilization(marketData.data.totalSupplied, marketData.data.totalBorrowed)
                : 0;

              // Get the token address for this market's loan asset
              const loanTokenAddress = market.loanAsset === 'USDC'
                ? contracts?.tokens.usdc.address.toString()
                : contracts?.tokens.zec.address.toString();

              const tokenPrice = loanTokenAddress ? prices.get(loanTokenAddress)?.price : undefined;

              if (marketData?.status === 'loaded' && marketData.data) {
                const totalSuppliedUSD = tokenAmountToUSD(marketData.data.totalSupplied, tokenPrice);
                const totalBorrowedUSD = tokenAmountToUSD(marketData.data.totalBorrowed, tokenPrice);

                console.log(`[MarketTable] Rendering ${market.loanAsset}/${market.collateralAsset}:`, {
                  poolAddress: market.poolAddress,
                  loanAsset: market.loanAsset,
                  tokenAddress: loanTokenAddress,
                  tokenPrice: tokenPrice?.toString(),
                  totalSupplied: marketData.data.totalSupplied.toString(),
                  totalBorrowed: marketData.data.totalBorrowed.toString(),
                  totalSuppliedScaled: scaleTokenAmount(marketData.data.totalSupplied),
                  totalBorrowedScaled: scaleTokenAmount(marketData.data.totalBorrowed),
                  totalSuppliedUSD,
                  totalBorrowedUSD,
                  utilization: utilization.toFixed(2) + '%',
                });
              }

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
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium bg-green-900/30 text-green-400 border border-green-900/50">
                      {market.supplyApy.toFixed(2)}%
                    </span>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <span className="font-mono text-text-muted font-medium">{market.borrowApy.toFixed(2)}%</span>
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
                        className="px-3 py-1.5 text-xs font-medium bg-brand-purple hover:bg-brand-purple-hover text-white rounded border border-transparent transition-colors"
                      >
                        Supply
                      </button>
                      <button
                        onClick={() => handleBorrowClick(market)}
                        className="px-3 py-1.5 text-xs font-medium bg-transparent hover:bg-surface-border text-text-muted hover:text-white border border-surface-border rounded transition-colors"
                      >
                        Borrow
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
        <span>Showing 1 to {marketConfigs.length} of {marketConfigs.length} markets</span>
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
            wallet={wallet}
            userAddress={address}
            onSupply={handleSupply}
          />
          <BorrowModal
            open={borrowModalOpen}
            onClose={() => setBorrowModalOpen(false)}
            debtTokenName={selectedMarket.loanAsset}
            availableToBorrow={500000000000000000n} // Mock: 0.5 token
            onBorrow={handleBorrow}
          />
        </>
      )}
    </>
  );
}
