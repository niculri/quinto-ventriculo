// Tests the label of a card: its code with the version, and which card or gap of the note it is.

import { describe, expect, it } from 'vitest';
import { cardLabel } from '../labels';

describe('the label of a card', () => {
  it.each([
    [
      'a basic card names only its code and version',
      { code: 'T-PR-01-002', version: 3, kind: 'basic', ord: 0 },
      'T-PR-01-002.3',
    ],
    [
      'the second card of a basic note says which one',
      { code: 'T-PR-01-002', version: 1, kind: 'basic', ord: 1 },
      'T-PR-01-002.1 · tarjeta 2',
    ],
    [
      'a cloze names its gap counting from 1',
      { code: 'T-PR-01-002', version: 2, kind: 'cloze', ord: 0 },
      'T-PR-01-002.2 · hueco 1',
    ],
    [
      'an occlusion is also a gap',
      { code: 'T-PR-01-002', version: 1, kind: 'occlusion', ord: 4 },
      'T-PR-01-002.1 · hueco 5',
    ],
    [
      'a code without a version keeps the bare code',
      { code: 'T-PR-01-002', version: null, kind: 'basic', ord: 0 },
      'T-PR-01-002',
    ],
    [
      'a card without a code says so, even with a version',
      { code: null, version: 2, kind: 'cloze', ord: 1 },
      'Sin código · hueco 2',
    ],
  ] as const)('%s', (_, card, label) => {
    expect(cardLabel(card)).toBe(label);
  });
});
