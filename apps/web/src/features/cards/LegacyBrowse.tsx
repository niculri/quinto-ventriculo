// `/anki/browse`, the old browser of every course: to the cards of the course or assessment of its search or of its
// card; with neither, the home page.

import { Navigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { searchTerm } from '@qv/anki-search';
import { paths } from '../../shared/lib/paths';
import { useServices } from '../../app/services';
import { Loading } from '../../shared/ui/Loading';
import { ErrorWithRetry } from '../../shared/ui/Notice';
import { hasPage, useAnkiTree } from '../anki/tree';
import type { AnkiTree, CourseDeckNode } from '../anki/tree';
import { cardParam } from './CardsPage';
import { scopeNodeOf, unitOf } from './scope';

function deckOfSearch(tree: AnkiTree, q: string): { node: CourseDeckNode; rest: string } | null {
  let best: { node: CourseDeckNode; rest: string; length: number } | null = null;
  for (const n of tree.nodes) {
    if (!hasPage(n)) continue;
    const term = searchTerm('deck', n.name);
    if (q !== term && !q.startsWith(`${term} `)) continue;
    if (!best || term.length > best.length) {
      best = { node: n, rest: q.slice(term.length).trim(), length: term.length };
    }
  }
  return best && { node: best.node, rest: best.rest };
}

function cardsOf(node: CourseDeckNode, query: { q?: string; card?: string }) {
  const scope = scopeNodeOf(node) ?? node;
  const unit = scope === node ? null : unitOf(scope, node);
  return paths.cards(scope.ref, { unit, q: query.q || null, card: query.card ?? null });
}

export function LegacyBrowse() {
  const [params] = useSearchParams();
  const { catalog, tree } = useAnkiTree();
  const { api } = useServices();
  const q = params.get('q') ?? '';
  const note = params.get('note');
  const ord = Number(params.get('ord') ?? '0');
  const byDeck = tree ? deckOfSearch(tree, q) : null;
  const card = useQuery({
    queryKey: ['card', note, ord],
    queryFn: ({ signal }) => api.card(note!, ord, signal),
    enabled: !!note && !!tree && !byDeck,
    retry: false,
  });
  if (catalog.isError) {
    return <ErrorWithRetry error={catalog.error} onRetry={() => void catalog.refetch()} />;
  }
  if (!tree) return <Loading />;
  const open = note ? cardParam({ noteGuid: note, ord }) : undefined;
  if (byDeck) {
    return (
      <Navigate
        replace
        to={cardsOf(byDeck.node, { q: byDeck.rest, ...(open ? { card: open } : {}) })}
      />
    );
  }
  if (note) {
    if (card.isError) return <Navigate replace to={paths.home} />;
    if (!card.data) return <Loading />;
    const deck = tree.byId.get(card.data.deckId);
    if (!deck || !hasPage(deck)) return <Navigate replace to={paths.home} />;
    return <Navigate replace to={cardsOf(deck, open ? { card: open } : {})} />;
  }
  return <Navigate replace to={paths.home} />;
}
