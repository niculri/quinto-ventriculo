// Tests what the cards pages are built from: the indexes' notes by lecture, the cards with each deck's decay, and the
// note types without repeats.
import { DEFAULT_PARAMETERS } from '@qv/srs';
import type { CardIndex } from '@qv/schema';
import type { StudyPreferences, UserPreset } from '@qv/schema/user';
import { cardKey } from '@qv/study';
import { describe, expect, it } from 'vitest';
import { CARD_INDEX } from '../../../../test/fixtures/cards';
import { CATALOG } from '../../../../test/fixtures/catalog';
import { storedCard } from '../../../../test/fixtures/storedCard';
import { buildAnkiTree } from '../../../catalog/model/tree';
import { cardsData } from '../cardsData';

const tree = buildAnkiTree(CATALOG);
const PREFS = { timeZone: 'UTC', dayStartsAt: 0 } as StudyPreferences;
const params = [...DEFAULT_PARAMETERS];
params[20] = 0.25;
const SLOW: UserPreset = {
  id: 'p1',
  name: 'Lenta',
  replaces: null,
  config: { fsrsParams: params },
  updatedAt: '2026-11-01T00:00:00.000Z',
};
const OTHER: CardIndex = {
  ...CARD_INDEX,
  assessmentId: 'otro/certamen-1',
  notes: [
    { ...CARD_INDEX.notes[0]!, guid: 'lost', cards: [{ ord: 0, deckId: 'gone' }] },
    { ...CARD_INDEX.notes[0]!, guid: 'empty', cards: [] },
  ],
};
const ROWS = [
  storedCard('s@/AqX%n?#', 0, '20'),
  storedCard('cloze-1', 1, '21'),
  storedCard('lost', 0, 'gone'),
];

const build = () =>
  cardsData({
    list: [CARD_INDEX, OTHER],
    rows: ROWS,
    prefs: PREFS,
    authorPresets: CATALOG.anki.presets,
    presets: [SLOW],
    settings: [{ deckId: '21', presetId: 'p1', authorPreset: null }],
    tree,
    nowMs: Date.now(),
    draftOnly: new Set(),
  });

describe('the cards pages’ data', () => {
  it('puts each note in its deck’s lecture, and a note of a deck not in the tree in a lecture of its own', () => {
    const data = build();
    expect(data.notes.map((n) => [n.note.guid, n.lectureId])).toEqual([
      ['s@/AqX%n?#', '20'],
      ['cloze-1', '20'],
      ['oclusion-1', '20'],
      ['lost', 'gone'],
    ]);
  });

  it('gives each card its deck’s decay, and the usual one to a card of a deck not in the tree', () => {
    const data = build();
    const decay = (guid: string, ord: number) =>
      data.byKey.get(cardKey({ noteGuid: guid, ord }))?.decay;
    expect(decay('s@/AqX%n?#', 0)).toBe(DEFAULT_PARAMETERS[20]);
    expect(decay('cloze-1', 1)).toBe(0.25);
    expect(decay('lost', 0)).toBe(0.5);
  });

  it('keeps each note type once, though two indexes bring it', () => {
    expect(build().noteTypes.map((t) => t.id)).toEqual(['1', '2', '3']);
  });
});
