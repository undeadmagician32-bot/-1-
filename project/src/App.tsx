import { Hero } from '@/components/Hero';
import { ScopeCard } from '@/components/ScopeCard';
import { Strengths } from '@/components/Strengths';
import { Defects } from '@/components/Defects';
import { Footer } from '@/components/Footer';
import { PrivateZone } from '@/components/PrivateZone';
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
      <p className="border-b border-success-600/30 bg-success-600/10 px-6 py-2 text-center text-sm text-success-400">
        공개 영역 · 누구나 볼 수 있는 소개입니다.{' '}
        <a href="#private-heading" className="underline underline-offset-2 hover:text-success-100">
          맨 아래 비공개 자리(패스키 잠금)로 가기
        </a>
      </p>
      <main id="main-content">
        <Hero />
        <Strengths items={strengths} />
        <ScopeCard />
        <Defects />
        <PrivateZone />
      </main>
      <Footer />
    </div>
  );
}

export default App;
