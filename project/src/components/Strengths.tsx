import { useState } from 'react';
import { ChevronDown, ExternalLink, Compass, Users, Code2, Brain, AlertTriangle } from 'lucide-react';
import type { Strength } from '@/data';
import { usePrefersReducedMotion } from '@/usePrefersReducedMotion';

const iconMap = {
  compass: Compass,
  users: Users,
  code: Code2,
  brain: Brain,
} as const;

const isRealLink = (link: string) => /^https?:\/\//.test(link);

function StrengthCard({ strength, index }: { strength: Strength; index: number }) {
  const [open, setOpen] = useState(false);
  const reduced = usePrefersReducedMotion();
  const Icon = iconMap[strength.icon];

  return (
    <article className="rounded-xl border border-ink-700 bg-ink-800/60 p-4 transition-colors hover:border-accent-600/40">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent-600/15 text-accent-300">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="flex-1">
          <h3 className="text-base font-medium text-ink-50">
            {String(index + 1).padStart(2, '0')} · {strength.title}
          </h3>
          <p className="mt-0.5 text-xs text-ink-300">{strength.tagline}</p>
        </div>
      </div>

      <button
        type="button"
        aria-expanded={open}
        aria-controls={`detail-${strength.id}`}
        onClick={() => setOpen((v) => !v)}
        className="mt-3 flex w-full items-center justify-between rounded-lg border border-ink-600 bg-ink-700/40 px-3 py-2 text-sm font-medium text-ink-100 transition-colors hover:bg-ink-700/70 hover:text-accent-200"
      >
        <span>상황 · 행동 · 결과 보기</span>
        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 text-accent-300 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
          style={{ transitionDuration: reduced ? '0ms' : '200ms' }}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          id={`detail-${strength.id}`}
          className="mt-4 space-y-4 rounded-lg border border-ink-600 bg-ink-900/50 p-4"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-300">
              상황
            </p>
            <p className="mt-1 text-sm leading-relaxed text-ink-100">
              {strength.situation}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-300">
              행동
            </p>
            <p className="mt-1 text-sm leading-relaxed text-ink-100">
              {strength.action}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-300">
              결과
            </p>
            <p className="mt-1 text-sm leading-relaxed text-ink-100">
              {strength.result}
            </p>
          </div>
        </div>
      )}

      {strength.evidence.images && strength.evidence.images.length > 0 && (
        <div className="mt-3 rounded-lg border border-accent-600/30 bg-accent-600/5 p-2">
          <div className="grid grid-cols-5 gap-1.5">
            {strength.evidence.images.map((src, i) => (
              <a
                key={src}
                href={src}
                target="_blank"
                rel="noopener noreferrer"
                className="block overflow-hidden rounded border border-ink-700"
              >
                <img
                  src={src}
                  alt={`${strength.evidence.label} 메모 ${i + 1}페이지`}
                  className="h-16 w-full object-cover"
                />
              </a>
            ))}
          </div>
          <span className="mt-1.5 block text-center text-xs text-accent-300/80">
            사진을 클릭하면 원본 크기로 열립니다 ({strength.evidence.images.length}장)
          </span>
        </div>
      )}

      {!strength.evidence.images && strength.evidence.image && (
        <a
          href={strength.evidence.image}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 block overflow-hidden rounded-lg border border-accent-600/30 bg-accent-600/5 p-2"
        >
          <img
            src={strength.evidence.image}
            alt={`${strength.evidence.label} 관련 스크린샷`}
            className="mx-auto max-h-40 w-auto rounded object-contain"
          />
          <span className="mt-1 block text-center text-xs text-accent-300/80">
            클릭하면 원본 크기로 열립니다
          </span>
        </a>
      )}

      {strength.evidence.links && strength.evidence.links.length > 0 && (
        <div className="mt-3 space-y-2">
          {strength.evidence.links.map((l) => (
            <a
              key={l.url}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-2 rounded-lg border border-accent-600/30 bg-accent-600/10 px-3 py-2 text-sm text-accent-200 transition-colors hover:bg-accent-600/20"
            >
              <span className="font-medium">{l.label}</span>
              <ExternalLink className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            </a>
          ))}
        </div>
      )}

      {!strength.evidence.links && isRealLink(strength.evidence.link) && (
        <a
          href={strength.evidence.link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-accent-600/30 bg-accent-600/10 px-3 py-2 text-sm text-accent-200 transition-colors hover:bg-accent-600/20"
        >
          <span>
            <span className="font-medium">{strength.evidence.label}</span>
            <span className="mt-0.5 block text-xs text-accent-300/70">
              {strength.evidence.description}
            </span>
          </span>
          <ExternalLink className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
        </a>
      )}

      {!strength.evidence.image &&
        !strength.evidence.images &&
        !isRealLink(strength.evidence.link) &&
        !strength.evidence.links && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-dashed border-warning-500/50 bg-warning-500/10 px-3 py-2 text-sm text-warning-500">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span>{strength.evidence.description}</span>
          </div>
        )}
    </article>
  );
}

export function Strengths({ items }: { items: Strength[] }) {
  return (
    <section
      aria-labelledby="strengths-heading"
      className="border-y border-ink-700 bg-ink-800/30"
    >
      <div className="mx-auto max-w-5xl px-6 py-8">
        <h2
          id="strengths-heading"
          className="text-xl font-semibold text-ink-50 sm:text-2xl"
        >
          강점과 취향 — 말이 아니라 근거
        </h2>
        <p className="mt-1 text-sm text-ink-300">
          강점 3개를 상황·행동·결과로 풀고, 공개 근거를 연결했습니다. 카드를 펼치면 자세한 내용을 볼 수 있습니다.
        </p>

        <div className="mt-5 grid gap-5 md:grid-cols-3">
          {items.map((item, i) => (
            <StrengthCard key={item.id} strength={item} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
