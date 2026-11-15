// The frame of the signed-in app: top bar, the site's menu on the left (a drawer on the phone), the page, the right
// column and the footer. Answering a test or studying a deck hides the menu and the column.
import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { paths } from '../shared/lib/paths';
import { Menu, Search } from 'lucide-react';
import { Link, Outlet, useLocation } from 'react-router';
import { SearchPalette } from '../features/search/components/SearchPalette';
import { AppNav } from '../features/nav/components/AppNav';
import { FocusContext } from '../shared/ui/focus';
import { RailContext } from '../shared/ui/rail';
import { Logo } from '../shared/ui/Logo';
import { UserMenu } from '../features/nav/components/UserMenu';
import { SiteFooter } from '../features/nav/components/SiteFooter';
import { keys } from '../shared/ui/keys';
import { usePreview } from '../features/preview/preview';
import { isAnswerScreen } from '../shared/ui/answerScreen';
import { CloseX } from '../shared/ui/Dialog';
import { appStrings } from './strings';

export function AppShell() {
  const [searching, setSearching] = useState(false);
  const [focus, setFocus] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rail, setRail] = useState<HTMLElement | null>(null);
  const preview = usePreview();
  const { pathname } = useLocation();
  const studying = isAnswerScreen(pathname);
  // Studying a deck is as answering a test: nothing but the card (no menu, no right column, no footer, and on a phone
  // no top bar: «Volver» is on the screen, at the same place in both).
  const hideNav = focus || studying;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLElement && e.target.closest('input, textarea, [contenteditable]');
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        setSearching(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#content"
        className="sr-only z-50 rounded-md bg-brand px-3 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {appStrings.skipToContent}
      </a>
      <header
        className={`sticky top-0 z-40 border-b border-border bg-chrome/85 backdrop-blur-md ${hideNav ? 'max-sm:hidden' : ''}`}
      >
        {/* The preview of the draft: a line over the bar and its mark in the logo, both on top of what is there (nothing
            moves when it comes or goes). */}
        {preview.active ? (
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
              onClick={() => setMenuOpen(true)}
              aria-label={appStrings.openMenu}
              className="-ml-1.5 rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-ink lg:hidden"
            >
              <Menu className="size-5" aria-hidden="true" />
            </button>
          )}
          <Link to={paths.home} className="rounded-md" aria-label={appStrings.homeLink}>
            <Logo compact tagline preview={preview.active} />
          </Link>
          <button
            type="button"
            onClick={() => setSearching(true)}
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

      <FocusContext.Provider value={setFocus}>
        <RailContext.Provider value={rail}>
          {/* Menu | page | right column: the same three columns on every page (only the questions of a test
              and studying a deck take the whole width). At least a screen tall below the bar, so the footer never
              shows while a page loads and then jumps away. */}
          <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-[90rem] flex-1">
            {hideNav ? null : (
              <aside className="hidden w-64 flex-none border-r border-border lg:block">
                <div className="sticky top-16 max-h-[calc(100dvh-4rem)] overflow-y-auto px-3 pt-5 pb-6">
                  <AppNav />
                </div>
              </aside>
            )}
            <main id="content" className="min-w-0 flex-1">
              <Outlet />
            </main>
            {hideNav ? null : (
              <aside aria-label={appStrings.rightColumn} className="hidden w-64 flex-none xl:block">
                <div
                  ref={setRail}
                  data-toc-scroll
                  className="sticky top-16 max-h-[calc(100dvh-4rem)] overflow-y-auto pt-5 pr-6 pb-10 pl-2"
                />
              </aside>
            )}
          </div>
        </RailContext.Provider>
      </FocusContext.Provider>

      <Dialog.Root open={menuOpen && !hideNav} onOpenChange={setMenuOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] lg:hidden" />
          <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-[min(20rem,85vw)] overflow-y-auto border-r border-border bg-bg py-4 pr-3 pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] shadow-soft lg:hidden">
            <div className="mb-3 flex items-center justify-between px-2.5">
              <Dialog.Title className="text-sm font-semibold">{appStrings.menu}</Dialog.Title>
              <CloseX label={appStrings.closeMenu} />
            </div>
            <Dialog.Description className="sr-only">
              {appStrings.menuDescription}
            </Dialog.Description>
            <AppNav onNavigate={() => setMenuOpen(false)} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <SiteFooter hidden={hideNav} />

      <SearchPalette open={searching} onOpenChange={setSearching} />
    </div>
  );
}
