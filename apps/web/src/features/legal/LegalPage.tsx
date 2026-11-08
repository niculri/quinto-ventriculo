import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { paths } from '../../app/paths';
import { formatDay } from '../../lib/dates';
import { Logo } from '../../ui/Logo';
import { CREDITS, SOURCE_CODE_URL } from '../../ui/credits';

/**
 * The frame of /privacy, /terms (step 2.3) and /licenses (step 2.4): public, with or without a session, and nothing of the material. The
 * same width as the site's pages (55.5rem). Their version and date are LEGAL_VERSIONS of @qv/schema.
 */
export function LegalPage({
  title,
  version,
  date,
  children,
}: {
  title: string;
  /** The version of a text people accept (/terms, /privacy); /licenses has none. */
  version?: string;
  /** «2026-11-08». */
  date?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    document.title = `${title} · El Quinto Ventrículo`;
    return () => {
      document.title = 'El Quinto Ventrículo';
    };
  }, [title]);

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
      <footer className="border-t border-border bg-chrome">
        <div className="mx-auto flex max-w-[90rem] flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-muted sm:px-6">
          <p>El Quinto Ventrículo · {CREDITS}</p>
          <nav aria-label="Textos legales" className="flex flex-wrap gap-x-4 gap-y-2">
            <Link to={paths.terms} className="hover:text-ink">
              Términos de uso
            </Link>
            <Link to={paths.privacy} className="hover:text-ink">
              Privacidad
            </Link>
            <Link to={paths.licenses} className="hover:text-ink">
              Licencias
            </Link>
            <a href={SOURCE_CODE_URL} className="hover:text-ink">
              Código fuente
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

/** A numbered part of a legal text: its heading (with an anchor) and its paragraphs. */
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
