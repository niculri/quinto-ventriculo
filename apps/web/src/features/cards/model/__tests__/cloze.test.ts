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

  it.each([
    ['a hole at the start leaves no empty text before it', '{{c1::uno}} y dos', [
      { text: 'uno', hole: { hint: null } },
      { text: ' y dos', hole: null },
    ]],
    ['a hole at the end leaves no empty text after it', 'uno y {{c1::dos}}', [
      { text: 'uno y ', hole: null },
      { text: 'dos', hole: { hint: null } },
    ]],
    ['an empty hint is no hint', '{{c1::uno::}}', [{ text: 'uno', hole: { hint: null } }]],
    ['the hint is cut at the last «::» outside the inner holes', '{{c1::a::b::c}}', [
      { text: 'a::b', hole: { hint: 'c' } },
    ]],
    ['a lone «}}» outside a hole is text', 'uno }} dos', [{ text: 'uno }} dos', hole: null }]],
    ['text without holes is one plain part', 'sin huecos', [{ text: 'sin huecos', hole: null }]],
    ['an empty text has no parts', '', []],
  ])('%s', (_, text, parts) => {
    expect(clozeParts(text)).toEqual(parts);
  });
});
