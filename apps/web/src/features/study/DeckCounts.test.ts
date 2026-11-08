import { describe, expect, it } from 'vitest';
import type { CardSummary, DeckDetail } from '@qv/schema';
import { deckCounts } from './DeckCounts';
import { defaultPreferences } from './repository';
import type { StoredCard } from './repository';
import { blankRow } from './session';
import { buildQueue, cardKey, queueCards } from './scheduler';
import type { StudyData, TreeDeck } from './scheduler';
import { EMPTY_PLAN } from './simple';

/**
 * A tree like the published one, with several branches: root → semester → course → assessment → two weeks →
 * decks with their Extras (a note with a card in a deck and another in its Extras).
 */
function tree(): StudyData {
  const decks: TreeDeck[] = [];
  const add = (id: string, name: string, parentId: string | null, preset = 'Default') =>
    decks.push({ id, name, label: name.split('::').at(-1)!, parentId, authorPreset: preset });
  add('1', 'R', null);
  add('2', 'R::S1', '1');
  add('3', 'R::S1::C', '2');
  add('4', 'R::S1::C::A', '3');
  for (const w of [1, 2]) {
    add(`5${w}`, `R::S1::C::A::W${w}`, '4');
    for (const d of [1, 2]) {
      add(`6${w}${d}`, `R::S1::C::A::W${w}::D${d}`, `5${w}`);
      add(`7${w}${d}`, `R::S1::C::A::W${w}::D${d}::Extras`, `6${w}${d}`, 'Extras');
    }
  }
  add('8', 'R::S2', '1');
  const leaves = decks.filter((d) => d.name.split('::').length >= 6).map((d) => d.id);
  const cards: CardSummary[] = [];
  for (let i = 0; i < 120; i++) {
    const deckId = leaves[i % leaves.length]!;
    const card = (ord: number, deck: string) =>
      cards.push({
        noteGuid: `n${String(i).padStart(3, '0')}`,
        ord,
        deckId: deck,
        code: null,
        version: null,
        kind: 'basic',
        text: '',
      });
    card(0, deckId);
    // A sibling in the Extras of its deck.
    if (i % 5 === 0 && !deckId.startsWith('7')) card(1, `7${deckId.slice(1)}`);
  }
  const now = Date.parse('2026-10-31T15:00:00Z');
  const rows = new Map<string, StoredCard>();
  cards.forEach((c, i) => {
    if (i % 3 !== 0) return;
    const day = 86_400_000;
    rows.set(cardKey(c), {
      ...blankRow(c),
      phase: 'review',
      interday: true,
      due: new Date(now - (i % 4) * day - 12 * 3600_000).toISOString(),
      interval: 4,
      stability: 4,
      difficulty: 5,
      reps: 3,
      lastReview: new Date(now - 5 * day).toISOString(),
      suspended: i % 21 === 0,
    });
  });
  const deck: DeckDetail = {
    id: '1',
    name: 'R',
    fullName: 'R',
    description: '',
    courseId: null,
    assessmentId: null,
    preset: 'Default',
    noteCount: 120,
    cardCount: cards.length,
    subdecks: decks.slice(1).map((d) => ({
      id: d.id,
      name: d.label,
      parentId: d.parentId,
      preset: d.authorPreset,
      cardCount: 0,
    })),
    cards,
    presets: [],
  };
  return {
    deck,
    decks,
    authorPresets: [
      { name: 'Default', config: { new: { perDay: 7 }, rev: { perDay: 200 } } },
      { name: 'Extras', config: { new: { perDay: 0 }, rev: { perDay: 4 } } },
    ],
    rows,
    answers: [{ deckId: '611', queueBefore: 'new' }],
    prefs: { ...defaultPreferences('America/Santiago'), fullAnki: true },
    presets: [],
    settings: [],
    plan: {
      ...EMPTY_PLAN,
      activations: decks
        .filter((d) => d.name.split('::').length === 5)
        .map((d) => ({ deckId: d.id, active: true })),
    },
  };
}

describe('the counts of the deck list', () => {
  it('each deck counts as the queue built from it with every card ', () => {
    const data = tree();
    const now = Date.parse('2026-10-31T15:00:00Z');
    const counts = deckCounts(data, now);
    expect(counts.size).toBe(data.decks.length);
    const all = queueCards(data, now);
    for (const d of data.decks) {
      const expected = buildQueue(data, d.id, now, undefined, undefined, all).counts();
      expect([d.name, counts.get(d.id)]).toEqual([d.name, expected]);
    }
    // The limits through the tree: the root 7 new a day (one studied today); an Extras, none and 4 reviews.
    expect(counts.get('1')!.new).toBe(6);
    expect(counts.get('1')!.review).toBeGreaterThan(10);
    expect(counts.get('711')!.review).toBeLessThanOrEqual(4);
    expect(counts.get('611')!.new).toBeGreaterThan(0);
    expect(counts.get('711')!.new).toBe(0);
    expect(counts.get('8')).toEqual({ new: 0, learning: 0, review: 0 });
  });
});
