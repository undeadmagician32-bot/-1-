import { Mail, MapPin, GraduationCap } from 'lucide-react';
import { profile, publicScope } from '@/data';

export function Hero() {
  return (
    <section aria-labelledby="hero-heading" className="relative overflow-hidden border-b border-ink-700">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 20%, #2a8b9e55 0, transparent 45%), radial-gradient(circle at 80% 60%, #1d6a7a33 0, transparent 50%)',
        }}
      />
      <div className="relative mx-auto max-w-5xl px-6 py-8 sm:py-10">
        <p className="mb-3 font-mono text-sm text-accent-300">
          {publicScope.target}
        </p>
        <h1
          id="hero-heading"
          className="text-3xl font-semibold tracking-tight text-ink-50 sm:text-4xl"
        >
          {profile.name}
          <span className="block text-lg font-normal text-ink-300 sm:text-xl">
            {profile.role}
          </span>
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-200 sm:text-lg">
          {profile.summary}
        </p>

        <ul className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          {profile.education && (
            <li className="flex items-center gap-2 text-ink-200">
              <GraduationCap className="h-4 w-4 text-accent-400" aria-hidden="true" />
              <span className="sr-only">학력: </span>
              <span>{profile.education}</span>
            </li>
          )}
          <li className="flex items-center gap-2 text-ink-200">
            <MapPin className="h-4 w-4 text-accent-400" aria-hidden="true" />
            <span className="sr-only">위치: </span>
            <span>{profile.location}</span>
          </li>
          {profile.emailPublic && (
            <li>
              <a
                href={`mailto:${profile.emailPublic}`}
                className="flex items-center gap-2 text-ink-200 transition-colors hover:text-accent-300"
              >
                <Mail className="h-4 w-4 text-accent-400" aria-hidden="true" />
                <span>{profile.emailPublic}</span>
              </a>
            </li>
          )}
        </ul>

        <div className="mt-6 flex flex-wrap gap-2">
          {profile.interests.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-accent-600/40 bg-accent-600/10 px-3 py-1 text-sm text-accent-200"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
