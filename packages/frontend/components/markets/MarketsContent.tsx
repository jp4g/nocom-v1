'use client';

import { useState } from 'react';
import Filters from './Filters';
import MarketTable from './MarketTable';

export type MarketType = 'debt' | 'stables';

export default function MarketsContent() {
  const [marketType, setMarketType] = useState<MarketType>('debt');

  return (
    <>
      <Filters marketType={marketType} onMarketTypeChange={setMarketType} />
      <MarketTable marketType={marketType} />
    </>
  );
}
