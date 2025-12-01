import MarketsNav from '@/components/shared/MarketsNav';
import MarketsFooter from '@/components/shared/MarketsFooter';
import AccountOverview from '@/components/portfolio/AccountOverview';
import SuppliesTable from '@/components/portfolio/SuppliesTable';
import BorrowsTable from '@/components/portfolio/BorrowsTable';

export default function PortfolioPage() {
  return (
    <div className="bg-black text-white min-h-screen flex flex-col font-light antialiased">
      <MarketsNav />

      <main className="flex-1 pt-24 px-6 pb-20 max-w-[1400px] mx-auto w-full">
        <AccountOverview />

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT COLUMN: SUPPLIES */}
          <div className="flex flex-col gap-6 h-full">
            <SuppliesTable />
          </div>

          {/* RIGHT COLUMN: BORROWS */}
          <div className="flex flex-col gap-6 h-full">
            <BorrowsTable />
          </div>
        </div>
      </main>

      <MarketsFooter />
    </div>
  );
}
