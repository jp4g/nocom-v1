import LandingNav from '@/components/shared/LandingNav';
import LandingFooter from '@/components/shared/LandingFooter';
import Hero from '@/components/landing/Hero';
import MarketDashboard from '@/components/landing/MarketDashboard';
import MechanismsSection from '@/components/landing/MechanismsSection';
import InteroperabilitySection from '@/components/landing/InteroperabilitySection';
import CTASection from '@/components/landing/CTASection';

export default function Home() {
  return (
    <>
      {/* Background Elements */}
      <div className="fixed inset-0 bg-grid-pattern z-0 pointer-events-none"></div>
      <div className="fixed top-[-20%] right-[-10%] w-[800px] h-[800px] bg-indigo-900/10 blur-[150px] rounded-full pointer-events-none z-0"></div>
      <div className="fixed bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-purple-900/5 blur-[150px] rounded-full pointer-events-none z-0"></div>

      <LandingNav />

      <main className="relative z-10 pt-32 pb-20">
        <Hero />
        <MarketDashboard />
        <MechanismsSection />
        <InteroperabilitySection />
        <CTASection />
      </main>

      <LandingFooter />
    </>
  );
}
