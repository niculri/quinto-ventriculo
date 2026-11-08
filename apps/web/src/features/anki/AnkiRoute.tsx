import { Navigate, useParams, useSearchParams } from 'react-router';
import { searchTerm } from '@qv/anki-search';
import { paths } from '../../app/paths';
import { Loading } from '../../ui/Loading';
import { ErrorWithRetry } from '../../ui/Notice';
import { NotFoundPage } from '../../ui/NotFoundPage';
import { Canonical } from '../catalog/Redirects';
import { FinalReviewPage } from '../study/FinalReviewPage';
import { StudyPage } from '../study/StudyPage';
import { DeckPage } from './DeckPage';
import { resolveCourseDeck, useAnkiTree } from './tree';
import type { CourseDeckNode } from './tree';

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
  if (catalog.isError) {
    return <ErrorWithRetry error={catalog.error} onRetry={() => void catalog.refetch()} />;
  }
  if (!tree) return <Loading />;
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
      return (
        <Canonical
          path={
            resolved.screen === 'study'
              ? paths.deckStudy(resolved.node.ref)
              : resolved.screen === 'review'
                ? paths.deckReview(resolved.node.ref)
                : paths.deck(resolved.node.ref)
          }
        />
      );
    case 'legacy':
      return <Navigate to={legacyTarget(resolved.node, resolved.what, search)} replace />;
    case 'deck':
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
    const deck = searchTerm('deck', node.name);
    return paths.browse({
      q: text ? `${deck} ${JSON.stringify(text)}` : deck,
      note,
      ord: note ? Number(search.get('ord') ?? '0') : null,
    });
  }
  return paths.deck(node.ref);
}
