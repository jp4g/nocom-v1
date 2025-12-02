import MarketsNav from '@/components/shared/MarketsNav';
import MarketsFooter from '@/components/shared/MarketsFooter';
import PortfolioContent from '@/components/portfolio/PortfolioContent';

export default function PortfolioPage() {
  return (
    <div className="bg-black text-white min-h-screen flex flex-col font-light antialiased">
      <MarketsNav />

      <main className="flex-1 pt-24 px-6 pb-20 max-w-[1400px] mx-auto w-full">
        <PortfolioContent />
      </main>

      <MarketsFooter />
    </div>
  );
}
