'use client';

import { useState } from 'react';
import Filters from './Filters';
import MarketTable from './MarketTable';

export type MarketType = 'all' | 'debt' | 'stables';

export default function MarketsContent() {
  const [marketType, setMarketType] = useState<MarketType>('all');

  return (
    <>
      <Filters marketType={marketType} onMarketTypeChange={setMarketType} />
      <MarketTable marketType={marketType} />
    </>
  );
}
