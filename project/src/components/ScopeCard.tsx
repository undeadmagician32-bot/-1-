import { Eye, EyeOff, Check } from 'lucide-react';
import { publicScope } from '@/data';

export function ScopeCard() {
  return (
    <section
      aria-labelledby="scope-heading"
      className="mx-auto max-w-5xl px-6 py-14"
    >
      <h2
        id="scope-heading"
        className="text-2xl font-semibold text-ink-50"
      >
        공개 범위 점검표
      </h2>
      <p className="mt-2 text-ink-300">
        이 페이지는 대상과 목적을 정하고, 공개할 정보와 비공개 정보를 구분해 만들었습니다.
      </p>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-success-600/30 bg-success-600/5 p-6">
          <div className="mb-4 flex items-center gap-2 text-success-400">
            <Eye className="h-5 w-5" aria-hidden="true" />
            <h3 className="text-lg font-medium text-success-400">공개하는 정보</h3>
          </div>
          <ul className="space-y-3">
            {publicScope.public.map((item) => (
              <li key={item} className="flex items-start gap-3 text-ink-100">
                <Check
                  className="mt-0.5 h-4 w-4 flex-shrink-0 text-success-400"
                  aria-hidden="true"
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-ink-600 bg-ink-800/50 p-6">
          <div className="mb-4 flex items-center gap-2 text-ink-300">
            <EyeOff className="h-5 w-5" aria-hidden="true" />
            <h3 className="text-lg font-medium text-ink-200">공개하지 않는 정보</h3>
          </div>
          <ul className="space-y-3">
            {publicScope.private.map((item) => (
              <li key={item} className="flex items-start gap-3 text-ink-300">
                <span
                  className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-ink-400"
                  aria-hidden="true"
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
