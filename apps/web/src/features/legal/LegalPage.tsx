// The frame of the public pages /privacy, /terms, /licenses and /about, with or without a session.
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { paths } from '../../shared/lib/paths';
import { formatDay } from '../../shared/lib/dates';
import { Logo } from '../../shared/ui/Logo';
import { SiteFooter } from '../nav/components/SiteFooter';
import { useTitle } from '../../shared/hooks/useTitle';

export function LegalPage({
  title,
  version,
  date,
  children,
}: {
  title: string;
  version?: string;
  date?: string;
  children: ReactNode;
}) {
  useTitle(title);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border bg-chrome">
        <div className="mx-auto flex h-16 max-w-[90rem] items-center px-4 sm:px-6">
          <Link
            to={paths.landing()}
            className="rounded-md"
            aria-label="El Quinto Ventrículo, portada"
          >
            <Logo />
          </Link>
        </div>
      </header>
      <main id="content" className="mx-auto w-full max-w-[55.5rem] flex-1 px-4 pt-8 pb-16 sm:px-5">
        <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        {version && date ? (
          <p className="mt-2 text-sm text-muted">
            Versión {version} · {formatDay(date)}
          </p>
        ) : null}
        <div className="mt-8 space-y-8 leading-relaxed text-ink">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}

export function Part({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="scroll-mt-6 font-serif text-xl font-semibold tracking-tight">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-[0.95rem] text-ink [&_li]:mt-1.5 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}
