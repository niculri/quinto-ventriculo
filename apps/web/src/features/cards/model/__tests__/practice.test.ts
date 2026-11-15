// Tests the cards of «Practicar estas»: never two of a note in a row.

import { describe, expect, it } from 'vitest';
import { CATALOG } from '../../../../test/render';
import { buildAnkiTree } from '../../../catalog/model/tree';
import { lectureOf } from '../../../catalog/model/scope';
import { syntheticIndex } from '../../api/demo';
import { explorerNotes } from '../explorer';
import { NO_FILTERS, applyFilters } from '../filters';
import { groupNotes } from '../groups';
import { practiceCards } from '../practice';

describe('the cards page’s model', () => {
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
});
