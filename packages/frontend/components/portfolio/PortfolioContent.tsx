'use client';

import { usePortfolioContext } from '@/contexts/PortfolioContext';
import AccountOverview from './AccountOverview';
import SuppliesTable from './SuppliesTable';
import BorrowsTable from './BorrowsTable';
import CollateralTable from './CollateralTable';

export default function PortfolioContent() {
  const { state, data } = usePortfolioContext();

  return (
    <>
      <AccountOverview
        state={state}
        netWorthUSD={data.netWorthUSD}
        avgHealthFactor={data.avgHealthFactor}
        totalLoansUSD={data.totalLoansUSD}
        totalDebtUSD={data.totalDebtUSD}
      />

      {/* Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT COLUMN: COLLATERAL */}
        <div className="flex flex-col gap-6 h-full">
          <CollateralTable
            state={state}
            positions={data.collateral}
            totalUSD={data.totalCollateralUSD}
          />
        </div>

        {/* RIGHT COLUMN: LOANS */}
        <div className="flex flex-col gap-6 h-full">
          <SuppliesTable
            state={state}
            positions={data.loans}
            totalUSD={data.totalLoansUSD}
          />
        </div>
      </div>

      {/* FULL WIDTH: DEBT */}
      <div className="mt-6">
        <BorrowsTable
          state={state}
          positions={data.debt}
          totalUSD={data.totalDebtUSD}
        />
      </div>
    </>
  );
}
