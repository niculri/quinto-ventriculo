// Where the old browser's URLs (`/anki/browse?q=…&note=…&ord=…`) go: the cards of the course or assessment of their
// search or of their card; with neither, the home page.

import { searchTerm } from '@qv/anki-search';
import type { CardDetail } from '@qv/schema';
import { paths } from '../../../shared/lib/paths';
import { hasPage } from '../../catalog/model/tree';
import type { AnkiTree, CourseDeckNode } from '../../catalog/model/tree';
import { scopeNodeOf, unitOf } from '../../catalog/model/scope';

export function deckOfSearch(
  tree: AnkiTree,
  q: string,
): { node: CourseDeckNode; rest: string } | null {
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

/** The URL to go to, or null while the card the URL names is on its way. */
export function legacyTarget({
  tree,
  byDeck,
  note,
  open,
  card,
}: {
  tree: AnkiTree;
  byDeck: { node: CourseDeckNode; rest: string } | null;
  note: string | null;
  open: string | undefined;
  card: { isError: boolean; data: CardDetail | undefined };
}): string | null {
  if (byDeck) return cardsOf(byDeck.node, { q: byDeck.rest, ...(open ? { card: open } : {}) });
  if (!note) return paths.home;
  if (card.isError) return paths.home;
  if (!card.data) return null;
  const deck = tree.byId.get(card.data.deckId);
  if (!deck || !hasPage(deck)) return paths.home;
  return cardsOf(deck, open ? { card: open } : {});
}
