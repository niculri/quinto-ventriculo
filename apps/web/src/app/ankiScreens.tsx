// The screens of a course's Anki URLs, each in its own chunk; once one is shown the others are fetched while the
// browser is idle, so moving between them rarely waits.

import { use, useEffect } from 'react';
import { useIsFetching } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { CourseDeckNode, DeckScreen } from '../features/catalog/model/tree';

type ScreenProps = { node: CourseDeckNode };
type Render = (props: ScreenProps) => ReactNode;

interface LazyScreen {
  Component: (props: ScreenProps) => ReactNode;
  preload: () => Promise<unknown>;
}

/**
 * Not `React.lazy`: that one suspends on its first render even when its chunk is already here, and a boundary that
 * shows its fallback keeps it about 300 ms. Here the promise carries `status` and `value` once settled, which is
 * what `use()` reads to hand the value back without suspending.
 */
function lazyScreen(load: () => Promise<Render>): LazyScreen {
  let pending: Promise<Render> | undefined;
  const preload = () => {
    if (pending) return pending;
    const p: Promise<Render> & { status?: 'fulfilled'; value?: Render } = load().then(
      (render) => {
        p.status = 'fulfilled';
        p.value = render;
        return render;
      },
      (e: unknown) => {
        // A failed fetch is not kept: the next render or preload asks again.
        pending = undefined;
        throw e;
      },
    );
    pending = p;
    return p;
  };
  return { Component: (props) => use(preload())(props), preload };
}

export const ankiScreens: Record<DeckScreen, LazyScreen> = {
  page: lazyScreen(() =>
    import('../features/decks/pages/DeckPage').then(({ DeckPage }) => (p) => <DeckPage {...p} />),
  ),
  study: lazyScreen(() =>
    import('../features/study/pages/StudyPage').then(({ StudyPage }) => (p) => (
      <StudyPage {...p} />
    )),
  ),
  review: lazyScreen(() =>
    import('../features/study/pages/FinalReviewPage').then(({ FinalReviewPage }) => (p) => (
      <FinalReviewPage {...p} />
    )),
  ),
  cards: lazyScreen(() =>
    import('../features/cards/pages/CardsPage').then(({ CardsPage }) => (p) => (
      <CardsPage {...p} />
    )),
  ),
  practice: lazyScreen(() =>
    import('../features/cards/pages/PracticePage').then(({ PracticePage }) => (p) => (
      <PracticePage {...p} />
    )),
  ),
};

/** The screen a URL is most likely for, before the catalog says which deck it is. */
export function screenOfPath(pathname: string): DeckScreen {
  if (pathname.endsWith('/cards/practice')) return 'practice';
  if (pathname.endsWith('/cards')) return 'cards';
  if (pathname.endsWith('/study')) return 'study';
  if (pathname.endsWith('/review')) return 'review';
  return 'page';
}

let warmed = false;

/**
 * Rendered beside a screen, inside its boundary: once it is shown and its reads are done, it fetches the other screens
 * while the browser is idle, so they do not slow down what this one is loading.
 */
export function WarmScreens() {
  const fetching = useIsFetching();
  useEffect(() => {
    if (warmed || fetching > 0) return;
    const run = () => {
      warmed = true;
      for (const s of Object.values(ankiScreens)) s.preload().catch(() => undefined);
    };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(run, IDLE_FALLBACK_MS);
    return () => clearTimeout(id);
  }, [fetching]);
  return null;
}

// Safari has no `requestIdleCallback`: a short wait instead.
const IDLE_TIMEOUT_MS = 2000;
const IDLE_FALLBACK_MS = 200;
