import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { CONTACT_EMAIL } from '@qv/schema';
import { paths } from '../app/paths';
import { useSession } from '../features/session/context';
import { LogoMark } from './Logo';
import { CREDITS, SOURCE_CODE_URL } from './credits';

/** What the footer says of the site: that students make it, apart from the university (step 2.7, EXP-P1). */
export const SITE_LINE = 'Sitio de estudiantes, sin relación oficial con la Universidad de Chile';

/** A footer link: at least 44 px tall on the phone, where it is touched (WCAG 2.5.5); a line of text on wider screens. */
const linkClass = 'inline-flex min-h-11 items-center hover:text-ink sm:min-h-0';

/**
 * The footer of every page (step 2.7): the signed-in app, the public pages (/about, /privacy, /terms, /licenses) and
 * the landing page. Two groups: the site (help, about, where to report a problem) and the legal texts with the source
 * code. Help is only offered with a session (it is behind the login); the rest works without one. Studying a deck
 * and answering a test's questions hide it (AppShell).
 */
export function SiteFooter({
  variant = 'app',
  hidden = false,
}: {
  /** `landing`: the landing page's narrower frame, with the logo's mark. */
  variant?: 'app' | 'landing';
  hidden?: boolean;
}) {
  const { state } = useSession();
  const signedIn = state.status === 'signed-in';
  const landing = variant === 'landing';
  const item = (key: string, node: ReactNode) => <li key={key}>{node}</li>;

  return (
    <footer
      className={`border-t border-border ${landing ? '' : 'bg-chrome'} ${hidden ? 'hidden' : ''}`}
    >
      <div
        className={`mx-auto flex flex-col gap-4 px-4 text-muted sm:px-6 ${
          landing ? 'max-w-6xl py-8 text-sm' : 'max-w-[90rem] py-6 text-xs'
        }`}
      >
        <div className="flex flex-wrap items-center gap-3">
          {landing ? <LogoMark className="size-6" /> : null}
          <p>
            El Quinto Ventrículo · {SITE_LINE} · {CREDITS}
          </p>
        </div>
        <div className="flex flex-wrap justify-between gap-x-8 gap-y-1">
          <nav aria-label="Sobre el sitio">
            <ul className="flex flex-wrap gap-x-4">
              {signedIn
                ? item(
                    'help',
                    <Link to={paths.help} className={linkClass}>
                      Ayuda
                    </Link>,
                  )
                : null}
              {item(
                'about',
                <Link to={paths.about} className={linkClass}>
                  Acerca de
                </Link>,
              )}
              {item(
                'report',
                <a href={`mailto:${CONTACT_EMAIL}`} className={linkClass}>
                  Reportar un problema
                </a>,
              )}
            </ul>
          </nav>
          <nav aria-label="Textos legales">
            <ul className="flex flex-wrap gap-x-4">
              <li>
                <Link to={paths.privacy} className={linkClass}>
                  Privacidad
                </Link>
              </li>
              <li>
                <Link to={paths.terms} className={linkClass}>
                  Términos de uso
                </Link>
              </li>
              <li>
                <Link to={paths.licenses} className={linkClass}>
                  Licencias
                </Link>
              </li>
              <li>
                <a href={SOURCE_CODE_URL} className={linkClass}>
                  Código fuente
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}
