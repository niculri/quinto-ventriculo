// The footer of every page, also the public ones: the site's links (help only with a session, about, reporting a
// problem) and the legal texts with the source code.
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { CONTACT_EMAIL } from '@qv/schema';
import { paths } from '../../../shared/lib/paths';
import { useSession } from '../../session/context';
import { LogoMark } from '../../../shared/ui/Logo';
import { CREDITS, SOURCE_CODE_URL } from '../../../shared/ui/credits';
import { navStrings } from '../strings';
import { sharedStrings } from '../../../shared/strings';

/** A footer link: at least 44 px tall on the phone, where it is touched (WCAG 2.5.5); a line of text on wider screens. */
const linkClass = 'inline-flex min-h-11 items-center hover:text-ink sm:min-h-0';

export function SiteFooter({
  variant = 'app',
  hidden = false,
}: {
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
            {sharedStrings.siteName} · {navStrings.footer.siteLine} · {CREDITS}
          </p>
        </div>
        <div className="flex flex-wrap justify-between gap-x-8 gap-y-1">
          <nav aria-label={navStrings.footer.aboutTheSite}>
            <ul className="flex flex-wrap gap-x-4">
              {signedIn
                ? item(
                    'help',
                    <Link to={paths.help} className={linkClass}>
                      {navStrings.help}
                    </Link>,
                  )
                : null}
              {item(
                'about',
                <Link to={paths.about} className={linkClass}>
                  {navStrings.footer.about}
                </Link>,
              )}
              {item(
                'report',
                <a href={`mailto:${CONTACT_EMAIL}`} className={linkClass}>
                  {navStrings.footer.report}
                </a>,
              )}
            </ul>
          </nav>
          <nav aria-label={navStrings.footer.legal}>
            <ul className="flex flex-wrap gap-x-4">
              <li>
                <Link to={paths.privacy} className={linkClass}>
                  {navStrings.footer.privacy}
                </Link>
              </li>
              <li>
                <Link to={paths.terms} className={linkClass}>
                  {navStrings.footer.terms}
                </Link>
              </li>
              <li>
                <Link to={paths.licenses} className={linkClass}>
                  {navStrings.footer.licenses}
                </Link>
              </li>
              <li>
                <a href={SOURCE_CODE_URL} className={linkClass}>
                  {navStrings.footer.source}
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}
