// Tests how a search snippet is cut into plain and marked parts, also when it starts or ends with a match or a mark is open.
import { HIGHLIGHT_END as E, HIGHLIGHT_START as S } from '@qv/schema';
import { describe, expect, it } from 'vitest';
import { snippetParts } from '../snippet';

const plain = (text: string) => ({ text, highlighted: false });
const mark = (text: string) => ({ text, highlighted: true });

describe('the parts of a snippet', () => {
  it.each([
    ['no match', 'sin marcas', [plain('sin marcas')]],
    [
      'a match inside',
      `dos ${S}subunidades${E} unidas`,
      [plain('dos '), mark('subunidades'), plain(' unidas')],
    ],
    [
      'a match at the start, with nothing empty before it',
      `${S}ARN${E} mensajero`,
      [mark('ARN'), plain(' mensajero')],
    ],
    [
      'a match at the end, with nothing empty after it',
      `el ${S}ARN${E}`,
      [plain('el '), mark('ARN')],
    ],
    ['two matches together', `${S}a${E}${S}b${E}`, [mark('a'), mark('b')]],
    ['a mark never closed, shown as text without it', `el ${S}ARN`, [plain('el ARN')]],
    ['an empty snippet', '', []],
  ])('%s', (_, snippet, parts) => {
    expect(snippetParts(snippet)).toEqual(parts);
  });
});
