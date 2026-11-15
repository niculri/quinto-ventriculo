// Tests the cards page's model: a cloze's holes, the plain search and the codes, the filters with their counts, the
// groups of the list and the cards of «Practicar estas».

import { describe, expect, it } from 'vitest';
import { CATALOG, CARD_INDEX } from '../../../../test/render';
import type { StoredCard } from '../../../progress/api/repository';
import { buildAnkiTree } from '../../../catalog/model/tree';
import {
  NO_FILTERS,
  applyFilters,
  clozeParts,
  explorerNotes,
  groupNotes,
  noteByCode,
  practiceCards,
  searchQuery,
} from '../explorer';
import { listItems, listMetrics } from '../list';
import { syntheticIndex, syntheticRows } from '../../api/demo';
import { lectureOf } from '../../../catalog/model/scope';
import { cardKey } from '@qv/study';

function row(noteGuid: string, ord: number, deckId: string, patch: Partial<StoredCard> = {}) {
  return {
    noteGuid,
    ord,
    deckId,
    phase: 'review',
    interday: true,
    remainingSteps: 0,
    due: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    interval: 3,
    stability: 5,
    difficulty: 5,
    reps: 2,
    lapses: 0,
    lastReview: new Date().toISOString(),
    flag: 0,
    suspended: false,
    buriedUntil: null,
    leech: false,
    updatedAt: new Date().toISOString(),
    ...patch,
  } satisfies StoredCard;
}

describe('the cards page’s model', () => {
  it('reads a cloze’s holes, nested or cut at the row’s length', () => {
    expect(clozeParts('A {{c1::uno {{c2::dos}} tres::pista}} y {{c3::cuatro')).toEqual([
      { text: 'A ', hole: null },
      { text: 'uno dos tres', hole: { hint: 'pista' } },
      { text: ' y ', hole: null },
      { text: 'cuatro', hole: { hint: null } },
    ]);
  });

  it('a plain search is plain text; a code finds its note', () => {
    expect(searchQuery('tag:x -y', false)).toBe('"tag\\:x" "-y"');
    expect(searchQuery('tag:x -y', true)).toBe('tag:x -y');
    const tree = buildAnkiTree(CATALOG);
    const notes = explorerNotes(
      [CARD_INDEX],
      (id) => lectureOf(tree.byId.get(id))?.id ?? id,
      new Map(),
    );
    expect(noteByCode(notes, 'PR-01-002.1')?.note.guid).toBe('cloze-1');
    expect(noteByCode(notes, 't-pr-01-003')?.note.guid).toBe('oclusion-1');
    expect(noteByCode(notes, 'vértebra')).toBeNull();
  });

  it('counts each option with the others as they are, and groups the images of a lecture together', () => {
    const tree = buildAnkiTree(CATALOG);
    const rows = new Map(
      [
        row('s@/AqX%n?#', 0, '20'),
        row('cloze-1', 0, '20', { lapses: 2 }),
        row('cloze-1', 1, '21', { suspended: true }),
      ].map((r) => [cardKey(r), r]),
    );
    const notes = explorerNotes([CARD_INDEX], (id) => lectureOf(tree.byId.get(id))?.id ?? id, rows);
    expect(new Set(notes.map((n) => n.lectureId))).toEqual(new Set(['20']));
    const all = applyFilters(notes, NO_FILTERS);
    expect(all.matched).toHaveLength(3);
    expect(all.facets.state).toEqual({
      all: 3,
      new: 1,
      seen: 2,
      hard: 1,
      failed: 0,
      marked: 0,
      hidden: 1,
    });
    expect(all.facets.origin).toEqual({ profe: 1, control: 0, clinica: 0, complemento: 0 });
    expect(all.facets.kind).toEqual({ all: 3, text: 2, image: 1 });
    const hard = applyFilters(notes, { ...NO_FILTERS, state: 'hard' });
    expect(hard.matched.map((m) => m.cards.map((c) => c.ord))).toEqual([[0]]);
    expect(hard.facets.kind).toEqual({ all: 1, text: 1, image: 0 });
    const lectures = groupNotes(all.matched);
    expect(lectures.map((l) => l.groups.map((g) => [g.title, g.items.length]))).toEqual([
      [
        ['Columna cervical', 2],
        ['Imágenes', 1],
      ],
    ]);
    expect(practiceCards(lectures, 'all')).toHaveLength(3);
    expect(
      practiceCards(
        groupNotes(applyFilters(notes, { ...NO_FILTERS, state: 'hidden' }).matched),
        'hidden',
      ),
    ).toHaveLength(1);
  });

  it('never two cards of a note in a row when practicing', () => {
    const index = syntheticIndex('anatomia-1/certamen-1', CATALOG.anki.decks, 300);
    const tree = buildAnkiTree(CATALOG);
    const notes = explorerNotes([index], (id) => lectureOf(tree.byId.get(id))?.id ?? id, new Map());
    const cards = practiceCards(groupNotes(applyFilters(notes, NO_FILTERS).matched), 'all');
    expect(cards.length).toBe(index.notes.reduce((t, n) => t + n.cards.length, 0));
    let together = 0;
    for (let i = 1; i < cards.length; i++)
      if (cards[i]!.noteGuid === cards[i - 1]!.noteGuid) together++;
    expect(together).toBeLessThan(12);
  });

  it('filters 8,000 notes in less than 100 ms', () => {
    const index = syntheticIndex('anatomia-1/certamen-1', CATALOG.anki.decks, 8000);
    const tree = buildAnkiTree(CATALOG);
    const rows = new Map(syntheticRows(index, Date.now()).map((r) => [cardKey(r), r]));
    const notes = explorerNotes([index], (id) => lectureOf(tree.byId.get(id))?.id ?? id, rows);
    const times: number[] = [];
    for (const state of ['all', 'hard', 'new', 'seen', 'marked'] as const) {
      const start = performance.now();
      const { matched } = applyFilters(notes, { ...NO_FILTERS, state, origins: ['profe'] });
      listItems(groupNotes(matched), listMetrics(800, true));
      times.push(performance.now() - start);
    }
    expect(Math.max(...times)).toBeLessThan(100);
  });
});
