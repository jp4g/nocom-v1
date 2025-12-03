import MarketsNav from '@/components/shared/MarketsNav';
import MarketsFooter from '@/components/shared/MarketsFooter';
import StatsBar from '@/components/markets/StatsBar';
import MarketsContent from '@/components/markets/MarketsContent';

export default function MarketsPage() {
  return (
    <div className="bg-black text-white min-h-screen flex flex-col">
      <MarketsNav />

      <main className="flex-1 pt-24 px-6 pb-20 max-w-[1400px] mx-auto w-full">
        {/* Header & Stats */}
        <div className="mb-12">
          <h1 className="text-3xl font-semibold mb-2">Explore Markets</h1>
          <p className="text-text-muted mb-8">Supply and borrow crypto assets with isolated risk efficiency.</p>

          <StatsBar />
        </div>

        <MarketsContent />
      </main>

      <MarketsFooter />
    </div>
  );
}
