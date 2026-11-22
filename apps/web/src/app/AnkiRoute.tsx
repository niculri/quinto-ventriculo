// The Anki URLs of a course (`…/anki/<decks…>` and its screens): each deck's page, study, review, cards and
// practice, each loaded on its first visit; old URLs and decks in another course go to their canonical place.

import { Navigate, useLocation, useParams, useSearchParams } from 'react-router';
import { Suspense, useEffect } from 'react';
import type { ReactNode } from 'react';
import { paths } from '../shared/lib/paths';
import { Loading } from '../shared/ui/Loading';
import { ErrorWithRetry } from '../shared/ui/Notice';
import { NotFoundPage } from '../shared/ui/NotFoundPage';
import { Canonical } from '../shared/ui/Canonical';
import { StudyFallback } from '../features/study/components/StudyFallback';
import { StudyLoading } from '../features/study/components/StudyLoading';
import { answerScreenBack } from '../shared/ui/answerScreen';
import { ankiScreens, screenOfPath, WarmScreens } from './ankiScreens';
import { scopeNodeOf, unitOf } from '../features/catalog/model/scope';
import { resolveCourseDeck, studyBackLabel } from '../features/catalog/model/tree';
import { useDraftOnly } from '../features/catalog/hooks/useDraftOnly';
import { DraftOnlyNotice } from '../shared/ui/DraftOnlyNotice';
import { useAnkiTree } from '../features/catalog/hooks/useAnkiTree';
import type { CourseDeckNode, DeckScreen } from '../features/catalog/model/tree';

export function AnkiRoute() {
  const params = useParams();
  const [search] = useSearchParams();
  const { catalog, tree } = useAnkiTree();
  const location = useLocation();
  // While the catalog loads, the chunk of the screen the URL is for comes at the same time.
  useEffect(() => {
    ankiScreens[screenOfPath(location.pathname)].preload().catch(() => undefined);
  }, [location.pathname]);
  // Studying without the catalog yet: its deck has no name, but «Volver» is needed (no site bar on a phone).
  const frame = (body: ReactNode) => {
    const back = answerScreenBack(location.pathname, location.search);
    return back ? (
      <StudyFallback back={back.to} label={back.label}>
        {body}
      </StudyFallback>
    ) : (
      body
    );
  };
  if (catalog.isError) {
    return frame(<ErrorWithRetry error={catalog.error} onRetry={() => void catalog.refetch()} />);
  }
  const loading = frame(<Loading />);
  if (!tree) return loading;
  const splat = (params['*'] ?? '').split('/').filter(Boolean);
  const resolved = resolveCourseDeck(
    tree,
    params.number ?? '',
    params.courseId ?? '',
    splat,
    search.get('subdeck'),
  );

  return routeOf(resolved, search, loading);
}

function routeOf(
  resolved: ReturnType<typeof resolveCourseDeck>,
  search: URLSearchParams,
  loading: ReactNode,
) {
  switch (resolved.kind) {
    case 'missing':
      return <NotFoundPage />;
    case 'moved':
      return <Canonical path={screenPath(resolved.node, resolved.screen, search)} />;
    case 'legacy':
      return <Navigate to={legacyTarget(resolved.node, resolved.what, search)} replace />;
    case 'deck':
      return deckScreen(resolved.node, resolved.screen, search, loading);
  }
}

function deckScreen(
  node: CourseDeckNode,
  screen: DeckScreen,
  search: URLSearchParams,
  loading: ReactNode,
) {
  if ((screen === 'cards' || screen === 'practice') && node.depth > 3) {
    return <Navigate to={screenPath(node, screen, search)} replace />;
  }
  if (screen === 'review' && node.depth !== 3) return <NotFoundPage />;
  const { Component } = ankiScreens[screen];
  // One boundary per screen, so going to another one shows its loading instead of keeping the last one; a study
  // screen waits for its code with what it shows while its deck loads.
  return (
    <Suspense
      key={screen}
      fallback={screen === 'study' || screen === 'review' ? <StudyLoading node={node} /> : loading}
    >
      <ScreenGate node={node} screen={screen}>
        <Component key={node.id} node={node} />
      </ScreenGate>
      <WarmScreens />
    </Suspense>
  );
}

function screenPath(node: CourseDeckNode, screen: DeckScreen, search: URLSearchParams): string {
  switch (screen) {
    case 'study':
      return paths.deckStudy(node.ref);
    case 'review':
      return paths.deckReview(node.ref);
    case 'page':
      return paths.deck(node.ref);
    case 'cards':
    case 'practice': {
      const scope = node.depth > 3 ? (scopeNodeOf(node) ?? node) : node;
      const query = Object.fromEntries(search);
      if (scope !== node) query.unit = unitOf(scope, node) ?? '';
      return screen === 'cards'
        ? paths.cards(scope.ref, query)
        : paths.cardsPractice(scope.ref, query);
    }
  }
}

function legacyTarget(
  node: CourseDeckNode,
  what: 'page' | 'study' | 'options',
  search: URLSearchParams,
) {
  if (what === 'study') return paths.deckStudy(node.ref);
  if (what === 'options') return paths.deckOptions({ deck: node.id });
  const note = search.get('note');
  const text = search.get('q');
  if (note || text) {
    const params = new URLSearchParams();
    if (text) params.set('q', text);
    if (note) params.set('card', `${Number(search.get('ord') ?? '0')}:${note}`);
    return screenPath(node, 'cards', params);
  }
  return paths.deck(node.ref);
}

/** What only the draft has is looked at, never answered: where one answers, the screen is a notice. */
function ScreenGate({
  node,
  screen,
  children,
}: {
  node: CourseDeckNode;
  screen: DeckScreen;
  children: ReactNode;
}) {
  const draftOnly = useDraftOnly(['deck', node.id]);
  if (!draftOnly || !['study', 'review', 'practice'].includes(screen)) return children;
  return (
    <StudyFallback back={paths.deck(node.ref)} label={studyBackLabel(node)}>
      <div className="mx-auto w-full max-w-lg py-16">
        <DraftOnlyNotice kind="deck" />
      </div>
    </StudyFallback>
  );
}
