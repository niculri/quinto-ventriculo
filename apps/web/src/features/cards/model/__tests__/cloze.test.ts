// Tests how a cloze's text is read in parts: its holes, nested or cut, with their hints.

import { describe, expect, it } from 'vitest';
import { clozeParts } from '../cloze';

describe('the cards page’s model', () => {
  it('reads a cloze’s holes, nested or cut at the row’s length', () => {
    expect(clozeParts('A {{c1::uno {{c2::dos}} tres::pista}} y {{c3::cuatro')).toEqual([
      { text: 'A ', hole: null },
      { text: 'uno dos tres', hole: { hint: 'pista' } },
      { text: ' y ', hole: null },
      { text: 'cuatro', hole: { hint: null } },
    ]);
  });
});
