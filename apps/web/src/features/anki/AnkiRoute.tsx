import { Navigate, useLocation, useParams, useSearchParams } from 'react-router';
import type { ReactNode } from 'react';
import { paths } from '../../app/paths';
import { Loading } from '../../ui/Loading';
import { ErrorWithRetry } from '../../ui/Notice';
import { NotFoundPage } from '../../ui/NotFoundPage';
import { Canonical } from '../catalog/Redirects';
import { FinalReviewPage } from '../study/FinalReviewPage';
import { StudyPage } from '../study/StudyPage';
import { StudyFallback } from '../study/StudyFallback';
import { answerScreenBack } from '../../ui/answerScreen';
import { DeckPage } from './DeckPage';
import { CardsPage } from '../cards/CardsPage';
import { PracticePage } from '../cards/PracticePage';
import { scopeNodeOf, unitOf } from '../cards/scope';
import { resolveCourseDeck, useAnkiTree } from './tree';
import type { CourseDeckNode, DeckScreen } from './tree';

/**
 * The Anki URLs of a course: `/semesters/:n/courses/:courseId/anki/<decks…>`, with `/study` at the end to
 * study the deck (`…/anki` alone is the course's own deck). Old URLs
 * (`…/anki/<deck>[/study|/options]?subdeck=`) go to their new place; a deck in another semester or course,
 * to its canonical URL.
 */
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
        // The cards are of a course or an assessment: a week or a lecture is a filter of its assessment's.
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
        // A final review is of an assessment.
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

/** A screen of a deck's URL; the cards of a deck below an assessment are its assessment's, with that unit. */
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

/**
 * Where an old URL goes: the deck page (or, with `?note=&ord=`, the card in the browser; with `?q=`, the
 * browser with that text), its study, or «Configuración de mazos» with the deck's preset.
 */
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
    // Its cards, with that card open or that text searched.
    const params = new URLSearchParams();
    if (text) params.set('q', text);
    if (note) params.set('card', `${Number(search.get('ord') ?? '0')}:${note}`);
    return screenPath(node, 'cards', params);
  }
  return paths.deck(node.ref);
}
