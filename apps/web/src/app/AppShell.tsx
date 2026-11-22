// The frame of the signed-in app: top bar, the site's menu on the left (a drawer on the phone), the page, the right
// column and the footer. Answering a test or studying a deck hides the menu and the column.
import { useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { SearchPalette } from '../features/search/components/SearchPalette';
import { AppNav } from '../features/nav/components/AppNav';
import { SiteFooter } from '../features/nav/components/SiteFooter';
import { FocusContext } from '../shared/ui/focus';
import { RailContext } from '../shared/ui/rail';
import { useAdminMode } from '../features/adminMode/adminMode';
import { isAnswerScreen } from '../shared/ui/answerScreen';
import { appStrings } from './strings';
import { TopBar } from './shell/TopBar';
import { PhoneMenu } from './shell/PhoneMenu';
import { useSearchShortcut } from './shell/useSearchShortcut';

export function AppShell() {
  const [searching, setSearching] = useState(false);
  const [focus, setFocus] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rail, setRail] = useState<HTMLElement | null>(null);
  const adminMode = useAdminMode();
  const { pathname } = useLocation();
  const studying = isAnswerScreen(pathname);
  // Studying a deck is as answering a test: nothing but the card (no menu, no right column, no footer, and on a phone
  // no top bar: «Volver» is on the screen, at the same place in both).
  const hideNav = focus || studying;

  useSearchShortcut(setSearching);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#content"
        className="sr-only z-50 rounded-md bg-brand px-3 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {appStrings.skipToContent}
      </a>
      <TopBar
        hideNav={hideNav}
        adminMode={adminMode.active}
        onMenu={() => setMenuOpen(true)}
        onSearch={() => setSearching(true)}
      />

      <FocusContext value={setFocus}>
        <RailContext value={rail}>
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
        </RailContext>
      </FocusContext>

      <PhoneMenu open={menuOpen && !hideNav} onOpenChange={setMenuOpen} />

      <SiteFooter hidden={hideNav} />

      <SearchPalette open={searching} onOpenChange={setSearching} />
    </div>
  );
}
