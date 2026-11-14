// The Anki URLs of a course (`…/anki/<decks…>` and its screens): each deck's page, study, review, cards and
// practice; old URLs and decks in another course go to their canonical place.

import { Navigate, useLocation, useParams, useSearchParams } from 'react-router';
import type { ReactNode } from 'react';
import { paths } from '../../shared/lib/paths';
import { Loading } from '../../shared/ui/Loading';
import { ErrorWithRetry } from '../../shared/ui/Notice';
import { NotFoundPage } from '../../shared/ui/NotFoundPage';
import { Canonical } from '../../shared/ui/Canonical';
import { FinalReviewPage } from '../study/FinalReviewPage';
import { StudyPage } from '../study/StudyPage';
import { StudyFallback } from '../study/StudyFallback';
import { answerScreenBack } from '../../shared/ui/answerScreen';
import { DeckPage } from './DeckPage';
import { CardsPage } from '../cards/CardsPage';
import { PracticePage } from '../cards/PracticePage';
import { scopeNodeOf, unitOf } from '../catalog/model/scope';
import { resolveCourseDeck } from '../catalog/model/tree';
import { useAnkiTree } from '../catalog/hooks/useAnkiTree';
import type { CourseDeckNode, DeckScreen } from '../catalog/model/tree';

export function AnkiRoute() {
  const params = useParams();
  const [search] = useSearchParams();
  const { catalog, tree } = useAnkiTree();
  const location = useLocation();
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
  if (!tree) return frame(<Loading />);
  const splat = (params['*'] ?? '').split('/').filter(Boolean);
  const resolved = resolveCourseDeck(
    tree,
    params['number'] ?? '',
    params['courseId'] ?? '',
    splat,
    search.get('subdeck'),
  );

  switch (resolved.kind) {
    case 'missing':
      return <NotFoundPage />;
    case 'moved':
      return <Canonical path={screenPath(resolved.node, resolved.screen, search)} />;
    case 'legacy':
      return <Navigate to={legacyTarget(resolved.node, resolved.what, search)} replace />;
    case 'deck':
      if (resolved.screen === 'cards' || resolved.screen === 'practice') {
        if (resolved.node.depth > 3) {
          return <Navigate to={screenPath(resolved.node, resolved.screen, search)} replace />;
        }
        return resolved.screen === 'cards' ? (
          <CardsPage key={resolved.node.id} node={resolved.node} />
        ) : (
          <PracticePage key={resolved.node.id} node={resolved.node} />
        );
      }
      if (resolved.screen === 'review') {
        return resolved.node.depth === 3 ? (
          <FinalReviewPage key={resolved.node.id} node={resolved.node} />
        ) : (
          <NotFoundPage />
        );
      }
      return resolved.screen === 'study' ? (
        <StudyPage key={resolved.node.id} node={resolved.node} />
      ) : (
        <DeckPage key={resolved.node.id} node={resolved.node} />
      );
  }
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
      if (scope !== node) query['unit'] = unitOf(scope, node) ?? '';
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
