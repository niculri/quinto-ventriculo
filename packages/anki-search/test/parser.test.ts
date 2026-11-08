import { describe, expect, it } from 'vitest';
import { SearchError, parseSearch } from '../src';
import type { SearchErrorKind, SearchNode } from '../src';

const t = (text: string): SearchNode => ({ type: 'text', text });

function errorOf(query: string): SearchError {
  try {
    parseSearch(query);
  } catch (e) {
    if (e instanceof SearchError) return e;
    throw e;
  }
  throw new Error(`no error for ${query}`);
}

describe('structure', () => {
  it('an empty search is every card', () => {
    expect(parseSearch('')).toEqual({ type: 'all' });
    expect(parseSearch('  \u3000 ')).toEqual({ type: 'all' });
  });

  it('implicit and explicit AND, any case', () => {
    const both = { type: 'and', nodes: [t('a'), t('b')] };
    expect(parseSearch('a b')).toEqual(both);
    expect(parseSearch('a and b')).toEqual(both);
    expect(parseSearch('a AND b')).toEqual(both);
    expect(parseSearch('a aNd b')).toEqual(both);
    expect(parseSearch('a\u3000b')).toEqual(both);
  });

  it('AND binds tighter than OR, as in Anki’s SQL', () => {
    expect(parseSearch('a or b c')).toEqual({
      type: 'or',
      nodes: [t('a'), { type: 'and', nodes: [t('b'), t('c')] }],
    });
    expect(parseSearch('a b OR c')).toEqual({
      type: 'or',
      nodes: [{ type: 'and', nodes: [t('a'), t('b')] }, t('c')],
    });
    expect(parseSearch('(a or b) c')).toEqual({
      type: 'and',
      nodes: [{ type: 'or', nodes: [t('a'), t('b')] }, t('c')],
    });
  });

  it('groups of one node and nested groups collapse', () => {
    expect(parseSearch('((a))')).toEqual(t('a'));
    expect(parseSearch('( a )')).toEqual(t('a'));
  });

  it('negation of terms and groups', () => {
    expect(parseSearch('-a')).toEqual({ type: 'not', node: t('a') });
    expect(parseSearch('-(a or b)')).toEqual({
      type: 'not',
      node: { type: 'or', nodes: [t('a'), t('b')] },
    });
    expect(parseSearch('-"a b"')).toEqual({ type: 'not', node: t('a b') });
    expect(parseSearch('--a')).toEqual({ type: 'not', node: t('-a') });
    // A lone hyphen is text, like in Anki.
    expect(parseSearch('- a')).toEqual({ type: 'and', nodes: [t('-'), t('a')] });
    expect(parseSearch('-')).toEqual(t('-'));
  });

  it('a tab is not a separator (only spaces are)', () => {
    expect(parseSearch('a\tb')).toEqual(t('a\tb'));
  });

  it('normalizes to NFC', () => {
    expect(parseSearch('árbol')).toEqual(t('árbol'));
  });
});

describe('quotes and escapes', () => {
  it('quoted text keeps spaces and keywords', () => {
    expect(parseSearch('"a b"')).toEqual(t('a b'));
    expect(parseSearch('"and"')).toEqual(t('and'));
    expect(parseSearch('a"b c"')).toEqual({ type: 'and', nodes: [t('a'), t('b c')] });
  });

  it('quotes around the whole term or after the colon', () => {
    const deck = { type: 'deck', name: 'a b' };
    expect(parseSearch('deck:"a b"')).toEqual(deck);
    expect(parseSearch('"deck:a b"')).toEqual(deck);
    expect(parseSearch('DeCk:"a b"')).toEqual(deck);
  });

  it('parser escapes are removed; wildcard escapes stay', () => {
    expect(parseSearch('a\\(b\\)')).toEqual(t('a(b)'));
    expect(parseSearch('\\-a')).toEqual(t('-a'));
    expect(parseSearch('dos\\:puntos')).toEqual(t('dos:puntos'));
    expect(parseSearch('"a \\"b\\""')).toEqual(t('a "b"'));
    expect(parseSearch('a\\"b')).toEqual(t('a"b'));
    expect(parseSearch('x\\*y')).toEqual(t('x\\*y'));
    expect(parseSearch('a\\_b')).toEqual(t('a\\_b'));
    expect(parseSearch('a\\\\b')).toEqual(t('a\\\\b'));
  });

  it('a colon makes a keyword or a field; an escaped one does not', () => {
    expect(parseSearch('front:x')).toEqual({
      type: 'field',
      field: 'front',
      value: 'x',
      mode: 'normal',
    });
    expect(parseSearch('a:b:c')).toEqual({
      type: 'field',
      field: 'a',
      value: 'b:c',
      mode: 'normal',
    });
    expect(parseSearch('fr\\:x:y')).toEqual({
      type: 'field',
      field: 'fr:x',
      value: 'y',
      mode: 'normal',
    });
    expect(parseSearch('front:')).toEqual({
      type: 'field',
      field: 'front',
      value: '',
      mode: 'normal',
    });
    expect(parseSearch('front:re:^a$')).toEqual({
      type: 'field',
      field: 'front',
      value: '^a$',
      mode: 'regex',
    });
    expect(parseSearch('front:nc:a\\:b')).toEqual({
      type: 'field',
      field: 'front',
      value: 'a\\:b',
      mode: 'noCombining',
    });
  });

  it('regular expressions keep their backslashes', () => {
    expect(parseSearch('"re:\\d+ \\"x\\""')).toEqual({ type: 'regex', pattern: '\\d+ "x"' });
  });
});

describe('keywords', () => {
  it('decks, tags, note types and templates', () => {
    expect(parseSearch('deck:a::b*')).toEqual({ type: 'deck', name: 'a::b*' });
    expect(parseSearch('tag:x::y')).toEqual({ type: 'tag', tag: 'x::y', regex: false });
    expect(parseSearch('tag:re:^x')).toEqual({ type: 'tag', tag: '^x', regex: true });
    expect(parseSearch('note:Básico')).toEqual({ type: 'noteType', name: 'Básico' });
    expect(parseSearch('card:2')).toEqual({ type: 'cardOrd', ord: 1 });
    expect(parseSearch('card:0')).toEqual({ type: 'cardOrd', ord: 0 });
    expect(parseSearch('card:Tarjeta*')).toEqual({ type: 'cardName', name: 'Tarjeta*' });
    expect(parseSearch('card:70000')).toEqual({ type: 'cardName', name: '70000' });
  });

  it('states, flags and ratings', () => {
    expect(parseSearch('is:due')).toEqual({ type: 'state', state: 'due' });
    expect(parseSearch('is:buried-manually')).toEqual({ type: 'state', state: 'buried' });
    expect(parseSearch('flag:0')).toEqual({ type: 'flag', flag: 0 });
    expect(parseSearch('rated:0')).toEqual({ type: 'rated', days: 1, rating: null });
    expect(parseSearch('rated:3:2')).toEqual({ type: 'rated', days: 3, rating: 2 });
    expect(parseSearch('introduced:7')).toEqual({ type: 'introduced', days: 7 });
    expect(parseSearch('added:0')).toEqual({ type: 'added', days: 1 });
  });

  it('properties, with s, d and r rounded like Anki writes them', () => {
    expect(parseSearch('prop:ivl>=10')).toEqual({ type: 'prop', prop: 'ivl', op: '>=', value: 10 });
    expect(parseSearch('prop:due=-1')).toEqual({ type: 'prop', prop: 'due', op: '=', value: -1 });
    expect(parseSearch('prop:s>2.31')).toEqual({ type: 'prop', prop: 's', op: '>', value: 2.31 });
    expect(parseSearch('prop:d=0.5')).toEqual({ type: 'prop', prop: 'd', op: '=', value: 5.5 });
    expect(parseSearch('prop:r<.9')).toEqual({ type: 'prop', prop: 'r', op: '<', value: 0.9 });
  });

  it('text with other keywords', () => {
    expect(parseSearch('nc:arbol')).toEqual({ type: 'noCombining', text: 'arbol' });
    expect(parseSearch('sc:atlas')).toEqual({ type: 'stripClozes', text: 'atlas' });
    expect(parseSearch('w:raro')).toEqual({ type: 'wordBoundary', text: 'raro' });
  });
});

describe('errors', () => {
  const cases: [string, SearchErrorKind, string][] = [
    ['(a', 'unclosedGroup', 'paréntesis de apertura `(` sin su cierre `)`'],
    ['a (b or c', 'unclosedGroup', 'ponlo entre comillas'],
    ['a)', 'unopenedGroup', 'paréntesis de cierre `)` sin su apertura `(`'],
    ['()', 'emptyGroup', 'sin nada adentro'],
    ['( )', 'emptyGroup', 'grupo'],
    ['deck:() x', 'emptyGroup', 'grupo'],
    ['""', 'emptyQuote', 'comillas `""`'],
    ['"a', 'unclosedQuote', 'no se cierran'],
    ['"a\\"', 'unclosedQuote', 'no se cierran'],
    ['deck:"a', 'unclosedQuote', 'no se cierran'],
    [':a', 'missingKey', 'dos puntos'],
    ['a\\x', 'unknownEscape', '`\\x`'],
    ['a\\', 'unknownEscape', '`\\`'],
    ['a\\ b', 'unknownEscape', 'secuencia de escape'],
    ['50\\%', 'unknownEscape', '`\\%`'],
    ['and', 'misplacedAnd', '`and`'],
    ['a and', 'misplacedAnd', '`and`'],
    ['a and and b', 'misplacedAnd', '`and`'],
    ['or a', 'misplacedOr', '`or`'],
    ['a or or b', 'misplacedOr', '`or`'],
    ['is:foo', 'invalidState', '`is:` no acepta `foo`'],
    ['is:NEW', 'invalidState', '`NEW`'],
    ['flag:8', 'invalidFlag', '`1` (rojo)'],
    ['flag:x', 'invalidFlag', '`7` (morado)'],
    ['prop:foo>1', 'invalidPropProperty', '`prop:` no acepta `foo>1`'],
    ['prop:IVL>1', 'invalidPropProperty', 'IVL'],
    ['prop:ivl', 'invalidPropOperator', '`prop:ivl` debe ir seguido'],
    ['prop:ivl>x', 'invalidPositiveWholeNumber', 'entero positivo'],
    ['prop:ivl>-1', 'invalidPositiveWholeNumber', 'entero positivo'],
    ['prop:due>1.5', 'invalidWholeNumber', 'entero en `due>1.5`'],
    ['prop:s>x', 'invalidNumber', 'número en `s>x`'],
    ['rated:x', 'invalidPositiveWholeNumber', '`rated:`'],
    ['rated:1:5', 'invalidAnswerButton', 'del 1 al 4'],
    ['added:-1', 'invalidPositiveWholeNumber', '`added:`'],
    ['introduced:x', 'invalidPositiveWholeNumber', '`introduced:`'],
    ['"re:a[b"', 'invalidRegex', 'expresión regular'],
    ['tag:re:(', 'unclosedGroup', 'paréntesis'],
    ['"tag:re:("', 'invalidRegex', 'expresión regular'],
  ];
  for (const [query, kind, text] of cases) {
    it(query, () => {
      const e = errorOf(query);
      expect(e.kind).toBe(kind);
      expect(e.message).toContain(text);
      expect(e.message.startsWith('Búsqueda no válida: ')).toBe(true);
    });
  }

  it('the flag message, in full', () => {
    expect(errorOf('flag:9').message).toBe(
      'Búsqueda no válida: `flag:` debe ir seguido de un número de marcador válido: `1` (rojo), `2` (naranja), `3` (verde), `4` (azul), `5` (rosa), `6` (turquesa), `7` (morado) o `0` (sin marcador).',
    );
  });

  const unsupported = [
    'nid:1',
    'cid:1,2',
    'did:1',
    'mid:1',
    'dupe:1,x',
    'edited:1',
    'resched:1',
    'preset:Default',
    'has-cd:x',
    'prop:ease>2',
    'prop:pos>1',
    'prop:rated=-1',
    'prop:resched=0',
    'prop:cdn:x>1',
    'deck:current',
  ];
  for (const query of unsupported) {
    it(`${query} is not available`, () => {
      const e = errorOf(query);
      expect(e.kind).toBe('unsupported');
      expect(e.message).toContain('no está disponible aquí');
    });
  }

  it('Anki’s own checks come first for keywords that are not available', () => {
    expect(errorOf('nid:x').kind).toBe('other');
    expect(errorOf('edited:x').kind).toBe('invalidPositiveWholeNumber');
    expect(errorOf('prop:rated>1').kind).toBe('invalidNegativeWholeNumber');
  });
});
