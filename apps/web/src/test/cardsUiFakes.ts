// A note of the cards page's list built by hand: a basic note «n1» of lecture «20» with one new card, with what a test
// changes (the index note's fields go in `note`, the cards in `cards`, those the filters leave in `on`).
import type { CardIndexNote } from '@qv/schema';
import type { ExplorerCard } from '../features/cards/model/explorer';
import type { Matched } from '../features/cards/model/filters';

export function explorerCard(ord: number, patch: Partial<ExplorerCard> = {}): ExplorerCard {
  return {
    noteGuid: 'n1',
    ord,
    deckId: '20',
    key: `n1/${ord}`,
    status: 'new',
    marked: false,
    ...patch,
  };
}

export function matched({
  note = {},
  cards = [explorerCard(0)],
  on = cards,
}: {
  note?: Partial<CardIndexNote>;
  cards?: ExplorerCard[];
  on?: ExplorerCard[];
} = {}): Matched {
  const n: CardIndexNote = {
    guid: 'n1',
    noteTypeId: '1',
    tags: [],
    code: 'T-PR-01-001',
    version: 1,
    createdAt: null,
    fields: ['Pregunta inventada', 'Respuesta inventada'],
    sortField: 'Pregunta inventada',
    cards: cards.map((c) => ({ ord: c.ord, deckId: c.deckId })),
    kind: 'basic',
    topic: 'Tema inventado',
    front: 'Pregunta inventada',
    back: 'Respuesta inventada',
    thumb: null,
    labels: 0,
    origin: [],
    ...note,
  };
  return {
    note: {
      note: n,
      assessmentId: 'a/c1',
      lectureId: '20',
      image: n.kind === 'occlusion' || n.kind === 'photo',
      cards,
      index: 0,
    },
    cards: on,
  };
}
