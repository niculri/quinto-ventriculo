// Tests the simple mode's plain search and the codes that find their note.

import { describe, expect, it } from 'vitest';
import { CATALOG, CARD_INDEX } from '../../../../test/render';
import { buildAnkiTree } from '../../../catalog/model/tree';
import { lectureOf } from '../../../catalog/model/scope';
import { explorerNotes } from '../explorer';
import { noteByCode, searchQuery } from '../search';

describe('the cards page’s model', () => {
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
});
