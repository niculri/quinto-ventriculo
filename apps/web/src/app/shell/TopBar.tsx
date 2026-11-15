// The top bar of the signed-in app: the phone's menu button, the logo, the search box and the account menu, with the
// draft preview's line over it.
import { Menu, Search } from 'lucide-react';
import { Link } from 'react-router';
import { paths } from '../../shared/lib/paths';
import { Logo } from '../../shared/ui/Logo';
import { keys } from '../../shared/ui/keys';
import { UserMenu } from '../../features/nav/components/UserMenu';
import { appStrings } from '../strings';

export function TopBar({
  hideNav,
  preview,
  onMenu,
  onSearch,
}: {
  hideNav: boolean;
  preview: boolean;
  onMenu: () => void;
  onSearch: () => void;
}) {
  return (
    <header
      className={`sticky top-0 z-40 border-b border-border bg-chrome/85 backdrop-blur-md ${hideNav ? 'max-sm:hidden' : ''}`}
    >
      {/* The preview of the draft: a line over the bar and its mark in the logo, both on top of what is there (nothing
          moves when it comes or goes). */}
      {preview ? (
        <>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-accent"
          />
          <p role="status" className="sr-only">
            {appStrings.previewActive}
          </p>
        </>
      ) : null}
      <div className="mx-auto flex h-16 max-w-[90rem] items-center gap-4 px-4 sm:px-6">
        {hideNav ? null : (
          <button
            type="button"
            onClick={onMenu}
            aria-label={appStrings.openMenu}
            className="-ml-1.5 rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-ink lg:hidden"
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>
        )}
        <Link to={paths.home} className="rounded-md" aria-label={appStrings.homeLink}>
          <Logo compact tagline preview={preview} />
        </Link>
        <button
          type="button"
          onClick={onSearch}
          className="mx-auto flex h-10 w-full max-w-md min-w-0 items-center gap-2.5 rounded-lg border border-border bg-surface px-3 text-sm text-muted shadow-xs transition hover:border-border-strong"
        >
          <Search className="size-4" aria-hidden="true" />
          <span className="flex-1 truncate text-left">{appStrings.search}</span>
          <kbd className="hidden rounded border border-border px-1.5 py-0.5 font-sans text-[0.7rem] sm:block">
            {keys('Ctrl+K')}
          </kbd>
        </button>
        <UserMenu />
      </div>
    </header>
  );
}
