import { Hero } from '@/components/Hero';
import { ScopeCard } from '@/components/ScopeCard';
import { Strengths } from '@/components/Strengths';
import { Defects } from '@/components/Defects';
import { Footer } from '@/components/Footer';
import { strengths } from '@/data';

function App() {
  return (
    <div className="min-h-screen bg-ink-900">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent-500 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-ink-900"
      >
        본문으로 건너뛰기
      </a>
      <main id="main-content">
        <Hero />
        <Strengths items={strengths} />
        <ScopeCard />
        <Defects />
      </main>
      <Footer />
    </div>
  );
}

export default App;
