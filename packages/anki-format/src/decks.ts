// Deck names and the tree of the decks a package brings.
import type { AnkiCollection, AnkiDeck } from './types';

export interface DeckNode {
  deck: AnkiDeck;
  /** Nearest ancestor that is in the package (Anki creates the missing ones on import). */
  parentId: string | null;
  cardCount: number;
}

export function parentDeckName(name: string): string | null {
  const i = name.lastIndexOf('::');
  return i < 0 ? null : name.slice(0, i);
}

export function deckLeafName(name: string): string {
  const i = name.lastIndexOf('::');
  return i < 0 ? name : name.slice(i + 2);
}

/** Only decks with cards and their ancestors (the empty «Default» is left out), sorted so parents come first. */
export function deckTree(collection: AnkiCollection): DeckNode[] {
  const byName = new Map(collection.decks.map((d) => [d.name, d]));
  const byId = new Map(collection.decks.map((d) => [d.id, d]));
  const direct = new Map<string, number>();
  for (const c of collection.cards) direct.set(c.deckId, (direct.get(c.deckId) ?? 0) + 1);

  const included = new Set<string>();
  for (const id of direct.keys()) {
    let deck = byId.get(id);
    while (deck && !included.has(deck.id)) {
      included.add(deck.id);
      deck = nearestAncestor(deck.name, byName);
    }
  }
  return collection.decks
    .filter((d) => included.has(d.id))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((deck) => ({
      deck,
      parentId: nearestAncestor(deck.name, byName)?.id ?? null,
      cardCount: direct.get(deck.id) ?? 0,
    }));
}

function nearestAncestor(name: string, byName: Map<string, AnkiDeck>): AnkiDeck | undefined {
  for (let p = parentDeckName(name); p !== null; p = parentDeckName(p)) {
    const found = byName.get(p);
    if (found) return found;
  }
  return undefined;
}
