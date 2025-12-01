export const formatCurrency = (value: number): string => {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
};

export const getAssetColor = (symbol: string): string => {
  const colors: Record<string, string> = {
    'USDC': 'bg-blue-500',
    'WETH': 'bg-purple-500',
    'WBTC': 'bg-orange-500',
    'ZEC': 'bg-yellow-400',
    'DAI': 'bg-yellow-500',
    'USDT': 'bg-teal-500',
    'wstETH': 'bg-cyan-500',
    'ARB': 'bg-blue-400',
    'FRAX': 'bg-gray-200',
    'CRV': 'bg-red-500',
    'LUSD': 'bg-blue-300',
    'LINK': 'bg-blue-600'
  };
  return colors[symbol] || 'bg-gray-500';
};
