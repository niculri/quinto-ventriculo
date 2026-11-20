// Tests the cards page's filters: each option counted with the others as they are, the groups they leave and how
// fast they filter a large assessment.

import { describe, expect, it } from 'vitest';
import { CARD_INDEX } from '../../../../test/fixtures/cards';
import { CATALOG } from '../../../../test/fixtures/catalog';
import { buildAnkiTree } from '../../../catalog/model/tree';
import { lectureOf } from '../../../catalog/model/scope';
import { cardKey } from '@qv/study';
import { syntheticIndex, syntheticRows } from '../../api/demo';
import { explorerNotes } from '../explorer';
import { NO_FILTERS, applyFilters } from '../filters';
import { groupNotes } from '../groups';
import { listItems, listMetrics } from '../list';
import { practiceCards } from '../practice';
import { storedCard } from '../../../../test/fixtures/storedCard';

describe('the cards page’s model', () => {
  it('counts each option with the others as they are, and groups the images of a lecture together', () => {
    const tree = buildAnkiTree(CATALOG);
    const rows = new Map(
      [
        storedCard('s@/AqX%n?#', 0, '20'),
        storedCard('cloze-1', 0, '20', { lapses: 2 }),
        storedCard('cloze-1', 1, '21', { suspended: true }),
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

  it('filters 8,000 notes in less than 100 ms', () => {
    const index = syntheticIndex('anatomia-1/certamen-1', CATALOG.anki.decks, 8000);
    const tree = buildAnkiTree(CATALOG);
    const rows = new Map(syntheticRows(index, Date.now()).map((r) => [cardKey(r), r]));
    const notes = explorerNotes([index], (id) => lectureOf(tree.byId.get(id))?.id ?? id, rows);
    // This thread's CPU time, not the clock: on a busy machine the clock also counts the time the worker waits.
    const cpuMs = () => {
      const { user, system } = process.threadCpuUsage();
      return (user + system) / 1000;
    };
    const times: number[] = [];
    for (const state of ['all', 'hard', 'new', 'seen', 'marked'] as const) {
      const start = cpuMs();
      const { matched } = applyFilters(notes, { ...NO_FILTERS, state, origins: ['profe'] });
      listItems(groupNotes(matched), listMetrics(800, true));
      times.push(cpuMs() - start);
    }
    expect(Math.max(...times)).toBeLessThan(100);
  });
});
