// Tests what the cards page reads from and writes to its URL: the open card and the filters it passes on.
import { describe, expect, it } from 'vitest';
import { cardParam, parseCardParam, queryOf, summaryOf } from '../urlState';
import type { ExplorerCard, ExplorerNote } from '../explorer';

describe('the open card of the URL', () => {
  it.each<[string, string | null, { noteGuid: string; ord: number } | null]>([
    [
      'is the number before the first «:» and the guid after it',
      '2:abc',
      { noteGuid: 'abc', ord: 2 },
    ],
    [
      'keeps a guid with «:» and other characters whole',
      '0:a:b/c?#',
      { noteGuid: 'a:b/c?#', ord: 0 },
    ],
    ['is none without a value', null, null],
    ['is none with an empty value', '', null],
    ['is none without a «:»', 'abc', null],
    ['is none without a number', ':abc', null],
    ['is none with a number that is not whole', '1.5:abc', null],
    ['is none with a negative number', '-1:abc', null],
    ['is none with something that is not a number', 'x:abc', null],
  ])('%s', (_, value, card) => {
    expect(parseCardParam(value)).toEqual(card);
  });

  it('is written back as it is read', () => {
    const card = { noteGuid: 'a:b?c', ord: 3 };
    expect(cardParam(card)).toBe('3:a:b?c');
    expect(parseCardParam(cardParam(card))).toEqual(card);
  });
});

describe('the filters the page passes on', () => {
  it('are the known ones with a value, and nothing else', () => {
    const params = new URLSearchParams({
      unit: 's1',
      q: 'vértebra',
      state: '',
      origin: 'profe',
      kind: 'image',
      day: '20000',
      card: '0:x',
      other: 'y',
    });
    expect(queryOf(params)).toEqual({
      unit: 's1',
      q: 'vértebra',
      origin: 'profe',
      kind: 'image',
      day: '20000',
    });
    expect(queryOf(new URLSearchParams())).toEqual({});
  });
});

describe('the summary of a card the viewer opens', () => {
  const note = (kind: string) =>
    ({ note: { code: 'T-1', version: 2, kind, sortField: 'Texto' } }) as unknown as ExplorerNote;
  const card = { noteGuid: 'g', ord: 1, deckId: '20' } as ExplorerCard;

  it('keeps a basic or cloze kind and takes any other as an occlusion', () => {
    expect(summaryOf(note('basic'), card)).toEqual({
      noteGuid: 'g',
      ord: 1,
      deckId: '20',
      code: 'T-1',
      version: 2,
      kind: 'basic',
      text: 'Texto',
    });
    expect(summaryOf(note('cloze'), card).kind).toBe('cloze');
    expect(summaryOf(note('occlusion'), card).kind).toBe('occlusion');
    expect(summaryOf(note('photo'), card).kind).toBe('occlusion');
  });
});
