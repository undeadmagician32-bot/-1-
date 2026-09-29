import { profile, publicScope } from '@/data';

export function Footer() {
  return (
    <footer className="border-t border-ink-700 bg-ink-900">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-sm text-ink-300">
          이 페이지는 누구에게 무엇을 보여 주는가 — {publicScope.target}
        </p>
        <p className="mt-4 text-sm text-ink-300">
          © {new Date().getFullYear()} {profile.name}. 공개 범위를 직접 정한 개인 소개 페이지.
        </p>
      </div>
    </footer>
  );
}
