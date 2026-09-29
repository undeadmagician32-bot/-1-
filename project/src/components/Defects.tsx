import { ArrowRight, Bug, Wrench, CheckCircle2 } from 'lucide-react';
import { defects } from '@/data';

export function Defects() {
  return (
    <section
      aria-labelledby="defects-heading"
      className="mx-auto max-w-5xl px-6 py-14"
    >
      <h2
        id="defects-heading"
        className="text-2xl font-semibold text-ink-50"
      >
        실제 결함 3개 — 수정 전과 후
      </h2>
      <p className="mt-2 text-ink-300">
        링크·키보드·제목 단계·명암·콘솔을 검사하여 발견한 결함을 고쳤습니다.
      </p>

      <ol className="mt-8 space-y-6">
        {defects.map((defect, i) => (
          <li
            key={i}
            className="rounded-xl border border-ink-700 bg-ink-800/60 p-6"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink-700 text-sm font-semibold text-ink-200">
                {i + 1}
              </span>
              <h3 className="text-base font-medium text-ink-100">
                결함 {i + 1}
              </h3>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-error-600/30 bg-error-600/5 p-4">
                <div className="mb-2 flex items-center gap-2 text-error-400">
                  <Bug className="h-4 w-4" aria-hidden="true" />
                  <span className="text-sm font-medium">수정 전</span>
                </div>
                <p className="text-sm leading-relaxed text-ink-200">
                  {defect.before}
                </p>
              </div>
              <div className="rounded-lg border border-success-600/30 bg-success-600/5 p-4">
                <div className="mb-2 flex items-center gap-2 text-success-400">
                  <Wrench className="h-4 w-4" aria-hidden="true" />
                  <span className="text-sm font-medium">수정 후</span>
                </div>
                <p className="text-sm leading-relaxed text-ink-200">
                  {defect.after}
                </p>
              </div>
            </div>

            <div className="mt-3 hidden items-center text-xs text-ink-300 md:flex">
              <ArrowRight className="mr-1 h-3 w-3" aria-hidden="true" />
              <span>수정 전 상태에서 수정 후 상태로 개선</span>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-6 flex items-center gap-2 rounded-lg border border-success-600/30 bg-success-600/5 px-4 py-3 text-sm text-success-400">
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        <span>최종 공개 화면의 브라우저 콘솔 빨간 오류: 0건</span>
      </div>
    </section>
  );
}
