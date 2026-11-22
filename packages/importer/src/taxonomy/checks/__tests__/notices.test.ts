// Tests the notices about balance: a topic that takes too much of its unit, and a section that has no item.
import { describe, expect, it } from 'vitest';
import { addBalanceNotices } from '../notices';
import { articleOf, contextOf, mapOf, taxonomyOf } from './contexts';

describe('addBalanceNotices', () => {
  const unit = {
    id: 'u1',
    title: 'u1',
    notes: ['n1'],
    topics: [
      { id: 't1', title: 'Uno', section: 'uno' },
      { id: 't2', title: 'Dos', section: 'dos' },
    ],
  };

  it('a section no counted topic points to is a notice, and a topic with no items at all counts as zero', () => {
    const ctx = contextOf(taxonomyOf([unit]), mapOf(), {
      entries: [{ id: 'n1' }],
      notes: [
        articleOf('n1', [
          ['uno', '1. Uno'],
          ['dos', '2. Dos'],
          ['tres', '3. Tres'],
        ]),
      ],
    });
    ctx.counted.push({ unit: 'u1', topic: 't1' });
    addBalanceNotices(ctx);
    expect(ctx.notices).toEqual([
      'El tema t1 «Uno» tiene 1 de los 1 ítems de la unidad u1 (100 %, más del 25 %).',
      'La sección «2. Dos» (dos) de n1, unidad u1, no tiene ningún ítem.',
      'La sección «3. Tres» (tres) de n1, unidad u1, no tiene ningún ítem.',
    ]);
  });

  it('nothing is said while there are problems, or when the import does not bring everything', () => {
    for (const op of [
      { notes: false },
      { partialNotes: true },
      { decks: false },
      { tests: false },
    ]) {
      const ctx = contextOf(taxonomyOf([unit]), mapOf(), { entries: [{ id: 'n1' }], op });
      ctx.counted.push({ unit: 'u1', topic: 't1' });
      addBalanceNotices(ctx);
      expect(ctx.notices).toEqual([]);
    }
    const failing = contextOf(taxonomyOf([unit]), mapOf(), { entries: [{ id: 'n1' }] });
    failing.problems.add('x', 'hay un problema');
    addBalanceNotices(failing);
    expect(failing.notices).toEqual([]);
  });
});
