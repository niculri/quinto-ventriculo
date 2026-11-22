// Tests the table's rows: each card as the search and the table see it, by the student's row of it, and each note as
// Anki's «Notas» mode adds its cards up.
import type { BrowseNote } from '@qv/schema';
import type { StoredCard, StudyPreferences } from '@qv/schema/user';
import { DEFAULT_PARAMETERS } from '@qv/srs';
import { cardKey } from '@qv/study';
import { describe, expect, it } from 'vitest';
import { browseCard } from '../../../../test/cardsFakes';
import { CARD_INDEX } from '../../../../test/fixtures/cards';
import { CATALOG } from '../../../../test/fixtures/catalog';
import { storedCard } from '../../../../test/fixtures/storedCard';
import { buildAnkiTree } from '../../../catalog/model/tree';
import {
  buildBrowseCards,
  cardsOfRows,
  decayFromParams,
  notesOf,
  viewerSummaries,
} from '../browseCards';
import type { BrowseNoteRow } from '../browseCards';

const PREFS = { timeZone: 'UTC', dayStartsAt: 0 } as StudyPreferences;
const NOW = Date.UTC(2026, 10, 1, 12);
const DECKS = buildAnkiTree(CATALOG).byId;
const NOTES: BrowseNote[] = CARD_INDEX.notes;

function build(rows: StoredCard[] = [], op: { notes?: BrowseNote[]; draftOnly?: string[] } = {}) {
  return buildBrowseCards(
    op.notes ?? NOTES,
    CATALOG.anki.noteTypes,
    DECKS,
    new Map(rows.map((r) => [cardKey(r), r])),
    PREFS,
    (deckId) => (deckId === '20' ? 0.4 : 0.2),
    NOW,
    new Set(op.draftOnly ?? []),
  );
}

describe('the table’s cards', () => {
  it('are every card of every note, with its template, kind, deck and the note’s place', () => {
    const cards = build();
    expect(
      cards.map((c) => [c.noteGuid, c.ord, c.template, c.kind, c.deck?.id, c.position]),
    ).toEqual([
      ['s@/AqX%n?#', 0, 'Directa', 'basic', '20', 1],
      ['cloze-1', 0, 'Cloze 1', 'cloze', '20', 2],
      ['cloze-1', 1, 'Cloze 2', 'cloze', '21', 2],
      ['oclusion-1', 0, 'Oclusión 1', 'occlusion', '20', 3],
    ]);
    expect(cards[0]!.createdMs).toBe(Date.parse('2026-10-08T12:00:00.000Z'));
    expect(cards[3]!.createdMs).toBeNull();
  });

  it('of a note type or deck that is not there have no template and are basic', () => {
    const lost: BrowseNote = {
      ...NOTES[0]!,
      guid: 'lost',
      noteTypeId: '99',
      cards: [{ ord: 0, deckId: 'x' }],
    };
    const [c] = build([], { notes: [lost] });
    expect(c).toMatchObject({ template: '', kind: 'basic', deck: undefined, noteType: undefined });
  });

  it('without a row are new, with nothing counted and no decay', () => {
    const [c] = build();
    expect(c).toMatchObject({
      type: 'new',
      queue: 'new',
      due: null,
      dueAt: null,
      intraday: false,
      interval: 0,
      reps: 0,
      lapses: 0,
      flag: 0,
      stability: null,
      difficulty: null,
      lastReview: null,
      decay: null,
      row: undefined,
      draftOnly: false,
    });
  });

  it('in review are due at the start of their day, with their deck’s decay', () => {
    const row = storedCard('s@/AqX%n?#', 0, '20', {
      due: '2026-11-05T03:00:00.000Z',
      reps: 4,
      lapses: 1,
      flag: 2,
    });
    const [c] = build([row]);
    expect(c).toMatchObject({
      type: 'review',
      queue: 'review',
      intraday: false,
      dueAt: Date.UTC(2026, 10, 5) / 1000,
      interval: 3,
      reps: 4,
      lapses: 1,
      flag: 2,
      stability: 5,
      difficulty: 5,
      decay: 0.4,
      row,
    });
  });

  it('in learning within the day are due at their very time', () => {
    const row = storedCard('cloze-1', 1, '21', {
      phase: 'learning',
      interday: false,
      due: '2026-11-01T12:10:00.000Z',
    });
    const c = build([row])[2]!;
    expect(c).toMatchObject({
      type: 'learn',
      queue: 'learn',
      intraday: true,
      dueAt: Date.parse('2026-11-01T12:10:00.000Z') / 1000,
      decay: 0.2,
    });
  });

  it('suspended or buried until later are out of their queue, and a burial that ended is not', () => {
    const later = new Date(NOW + 3_600_000).toISOString();
    const earlier = new Date(NOW - 3_600_000).toISOString();
    const cards = build([
      storedCard('s@/AqX%n?#', 0, '20', { suspended: true, buriedUntil: later }),
      storedCard('cloze-1', 0, '20', { buriedUntil: later }),
      storedCard('cloze-1', 1, '21', { buriedUntil: earlier }),
    ]);
    expect(cards.slice(0, 3).map((c) => c.queue)).toEqual(['suspended', 'buried', 'review']);
  });

  it('a card without stability has no decay, and the draft’s own cards are marked', () => {
    const key = cardKey({ noteGuid: 'oclusion-1', ord: 0 });
    const row = storedCard('oclusion-1', 0, '20', { stability: 0 });
    const c = build([row], { draftOnly: [key] })[3]!;
    expect(c.decay).toBeNull();
    expect(c.draftOnly).toBe(true);
  });
});

describe('a deck’s decay', () => {
  it('is the 21st parameter of its FSRS parameters, and the default one when it has none', () => {
    const params = [...DEFAULT_PARAMETERS];
    params[20] = 0.33;
    expect(decayFromParams(params)).toBe(0.33);
    expect(decayFromParams([])).toBe(DEFAULT_PARAMETERS[20]);
  });
});

describe('the «Notas» mode', () => {
  const cards = [
    browseCard({
      note: { guid: 'a' },
      ord: 0,
      type: 'review',
      interval: 4,
      reps: 3,
      lapses: 1,
      stability: 2,
      difficulty: 4,
      dueAt: 900,
    }),
    browseCard({
      note: { guid: 'a' },
      ord: 1,
      type: 'new',
      interval: 0,
      reps: 0,
      lapses: 0,
      dueAt: null,
    }),
    browseCard({
      note: { guid: 'a' },
      ord: 2,
      type: 'relearn',
      interval: 1,
      reps: 2,
      lapses: 2,
      stability: 4,
      difficulty: 6,
      dueAt: 500,
      draftOnly: true,
    }),
    browseCard({ note: { guid: 'b' }, ord: 0 }),
  ];

  it('adds up each note’s repetitions and lapses and averages what its seen cards have', () => {
    const [a, b] = notesOf(cards);
    expect(a).toMatchObject({
      key: 'note:a',
      template: '3 tarjetas',
      reps: 5,
      lapses: 3,
      interval: 3,
      stability: 3,
      difficulty: 5,
      dueAt: 500,
      type: 'review',
      draftOnly: true,
    });
    expect(a!.cards).toHaveLength(3);
    expect(b).toMatchObject({
      key: 'note:b',
      template: '1 tarjeta',
      interval: 0,
      stability: null,
      difficulty: null,
      dueAt: null,
      type: 'new',
      draftOnly: false,
    });
  });

  it('rounds the average interval, and gives the table every card of the notes in their order', () => {
    const two = [
      browseCard({ note: { guid: 'c' }, ord: 0, type: 'review', interval: 1 }),
      browseCard({ note: { guid: 'c' }, ord: 1, type: 'review', interval: 2 }),
    ];
    expect(notesOf(two)[0]!.interval).toBe(2);
    const rows: BrowseNoteRow[] = notesOf(cards);
    expect(cardsOfRows(rows, 'notes').map((c) => `${c.noteGuid}${c.ord}`)).toEqual([
      'a0',
      'a1',
      'a2',
      'b0',
    ]);
    expect(cardsOfRows(cards, 'cards')).toBe(cards);
  });
});

describe('what the big viewer shows', () => {
  it('is each card in order, with its note’s code, version and text', () => {
    const [c] = build();
    expect(viewerSummaries([c!])).toEqual([
      {
        noteGuid: 's@/AqX%n?#',
        ord: 0,
        deckId: '20',
        code: 'T-PR-01-001',
        version: 2,
        kind: 'basic',
        text: '¿Cuántas vértebras cervicales hay?',
      },
    ]);
  });
});
