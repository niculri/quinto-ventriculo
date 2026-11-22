// The text helpers a search is built on: Rust-style number parsing, SQLite LIKE, accents and cloze marks, and the
// translator from Rust regular expressions to JavaScript, with what it accepts and what it refuses.
import { describe, expect, it } from 'vitest';
import { SearchError } from '../errors';
import {
  asU32,
  asciiLower,
  f32AsWritten,
  foldCase,
  likeMatcher,
  parseF32,
  parseSigned,
  parseUnsigned,
  rustRegex,
  stripClozes,
  trimUnicode,
  withoutCombining,
} from '../text';

describe('numbers as Rust reads them', () => {
  it('unsigned: digits with an optional plus, up to the maximum', () => {
    expect(parseUnsigned('42', 100)).toBe(42);
    expect(parseUnsigned('+7', 100)).toBe(7);
    expect(parseUnsigned('100', 100)).toBe(100);
    expect(parseUnsigned('101', 100)).toBeNull();
    for (const bad of ['-1', '', '1.5', ' 1', '1 ', '1e2', 'x'])
      expect(parseUnsigned(bad, 100)).toBeNull();
  });

  it('signed: either sign, within both ends', () => {
    expect(parseSigned('-3', -5, 5)).toBe(-3);
    expect(parseSigned('+3', -5, 5)).toBe(3);
    expect(parseSigned('-5', -5, 5)).toBe(-5);
    expect(parseSigned('-6', -5, 5)).toBeNull();
    expect(parseSigned('6', -5, 5)).toBeNull();
    expect(parseSigned('--3', -5, 5)).toBeNull();
  });

  it('float: decimals, exponents, signs and the words Rust knows, rounded to 32 bits', () => {
    expect(parseF32('1.5')).toBe(1.5);
    expect(parseF32('.5')).toBe(0.5);
    expect(parseF32('5.')).toBe(5);
    expect(parseF32('-2e2')).toBe(-200);
    expect(parseF32('+0.1')).toBe(Math.fround(0.1));
    expect(parseF32('0.1')).not.toBe(0.1);
    for (const bad of ['', '.', 'e5', '1e', '1,5', 'abc', '0x10']) expect(parseF32(bad)).toBeNull();
  });

  it('float: nan and infinity in any case and sign', () => {
    expect(parseF32('NaN')).toBeNaN();
    expect(parseF32('-nan')).toBeNaN();
    expect(parseF32('inf')).toBe(Infinity);
    expect(parseF32('+Infinity')).toBe(Infinity);
    expect(parseF32('-inf')).toBe(-Infinity);
    expect(parseF32('-INFINITY')).toBe(-Infinity);
  });

  it('the f32 written as Rust prints it is the shortest decimal that reads back as the same f32', () => {
    expect(f32AsWritten(0.1)).toBe(0.1);
    expect(f32AsWritten(Math.fround(0.3))).toBe(0.3);
    expect(f32AsWritten(16_777_216)).toBe(16_777_216);
    expect(f32AsWritten(Math.fround(1 / 3))).toBe(0.33333334);
    // This one needs nine digits: eight read back as the f32 next to it.
    expect(f32AsWritten(14.711431503295898)).toBe(14.7114315);
    expect(f32AsWritten(0)).toBe(0);
    expect(f32AsWritten(Number.NaN)).toBeNaN();
    expect(f32AsWritten(Infinity)).toBe(Infinity);
    expect(f32AsWritten(-Infinity)).toBe(-Infinity);
  });

  it('wraps to 32 bits unsigned, also from the negatives', () => {
    expect(asU32(5)).toBe(5);
    expect(asU32(-1)).toBe(4_294_967_295);
    expect(asU32(4_294_967_296)).toBe(0);
    expect(asU32(4_294_967_297)).toBe(1);
  });
});

describe('case, accents and cloze marks', () => {
  it('lowercases only ASCII letters, like SQLite', () => {
    expect(asciiLower('ABC Ñ É')).toBe('abc Ñ É');
    expect(asciiLower('abc')).toBe('abc');
  });

  it('folds case as the unicase collation does, any alphabet', () => {
    expect(foldCase('ÁRBOL Straße')).toBe('árbol strasse');
    expect(foldCase('ΣΑΣ')).toBe(foldCase('σας'));
  });

  it('removes accents and the letters Anki maps by hand, but leaves plain ASCII alone', () => {
    expect(withoutCombining('árbol')).toBe('arbol');
    expect(withoutCombining('Œuvre Ø ß đ')).toBe('OEuvre O s d');
    expect(withoutCombining('plain')).toBe('plain');
    expect(withoutCombining('ﬁ')).toBe('fi');
  });

  it('takes the marks off a cloze and keeps its words, hints included, across lines', () => {
    expect(stripClozes('a {{c1::b::hint}} c {{c12::d}}')).toBe('a b c d');
    expect(stripClozes('{{c1::multi\nline}}')).toBe('multi\nline');
    expect(stripClozes('no marks')).toBe('no marks');
    expect(stripClozes('{{not a cloze}}')).toBe('{{not a cloze}}');
  });

  it('trims every Unicode space, not only the ASCII ones', () => {
    expect(trimUnicode('\u3000 \u00a0x y\u2003')).toBe('x y');
  });
});

describe('likeMatcher (SQLite LIKE with a backslash escape)', () => {
  const like = (pattern: string, text: string) => likeMatcher(pattern)(asciiLower(text));

  it('% is any run and _ is one character, astral ones too', () => {
    expect(like('a%c', 'abbbc')).toBe(true);
    expect(like('a%c', 'ac')).toBe(true);
    expect(like('a_c', 'abc')).toBe(true);
    expect(like('a_c', 'ac')).toBe(false);
    expect(like('a_c', 'a😀c')).toBe(true);
  });

  it('a pattern of only literals is an exact, prefix, suffix or contains match by its percents', () => {
    expect(like('abc', 'abc')).toBe(true);
    expect(like('abc', 'abcd')).toBe(false);
    expect(like('abc%', 'abcd')).toBe(true);
    expect(like('%abc', 'xabc')).toBe(true);
    expect(like('%abc', 'abcx')).toBe(false);
    expect(like('%abc%', 'xabcx')).toBe(true);
    expect(like('%abc%', 'xabx')).toBe(false);
  });

  it('only percents match anything, and nothing at all matches only the empty text', () => {
    expect(like('%', 'x')).toBe(true);
    expect(like('%%', '')).toBe(true);
    expect(like('', '')).toBe(true);
    expect(like('', 'x')).toBe(false);
  });

  it('case is folded for ASCII only', () => {
    expect(like('ABC', 'abc')).toBe(true);
    expect(like('Ñ', 'ñ')).toBe(false);
  });

  it('an escaped percent, underscore or backslash is itself', () => {
    expect(like('100\\%', '100%')).toBe(true);
    expect(like('100\\%', '1000')).toBe(false);
    expect(like('a\\_b', 'a_b')).toBe(true);
    expect(like('a\\_b', 'axb')).toBe(false);
    expect(like('a\\\\b', 'a\\b')).toBe(true);
  });

  it('an escape at the very end of the pattern matches nothing', () => {
    expect(likeMatcher('abc\\')('abc')).toBe(false);
    expect(likeMatcher('\\')('')).toBe(false);
  });

  it('mixed wildcards and literals are matched whole, with special characters kept literal', () => {
    expect(like('%a.b_c%', 'xx a.bzc yy'.replace(/ /g, ''))).toBe(true);
    expect(like('%a.b_c%', 'xxaXbzcyy')).toBe(false);
    expect(like('a_%', 'a')).toBe(false);
    expect(like('a_%', 'ab')).toBe(true);
  });
});

describe('rustRegex: what it matches', () => {
  const re = (pattern: string) => rustRegex(pattern);

  it('\\d, \\s and \\w are the Unicode ones; their capitals are the opposites', () => {
    expect(re('^\\d$').test('٣')).toBe(true);
    expect(re('^\\D$').test('٣')).toBe(false);
    expect(re('^\\s$').test('\u00a0')).toBe(true);
    expect(re('^\\S$').test('\u00a0')).toBe(false);
    expect(re('^\\w$').test('ñ')).toBe(true);
    expect(re('^\\W$').test('ñ')).toBe(false);
    expect(re('^\\W$').test('-')).toBe(true);
    expect(re('^\\w$').test('_')).toBe(true);
  });

  it('\\w works inside a class, \\W does not', () => {
    expect(re('^[\\w-]+$').test('añ-b')).toBe(true);
    expect(() => re('[\\W]')).toThrow(/\\W dentro de una clase/);
  });

  it('\\b and \\B are word boundaries in Unicode, and not allowed inside a class', () => {
    expect(re('\\bé').test('é')).toBe(true);
    expect(re('\\bé').test('aé')).toBe(false);
    expect(re('a\\Bé').test('aé')).toBe(true);
    expect(re('a\\Bé').test('a é')).toBe(false);
    expect(() => re('[\\b]')).toThrow(/\\b dentro de una clase/);
    expect(() => re('[\\B]')).toThrow(/\\B dentro de una clase/);
  });

  it('\\A and \\z are the ends of the whole text, even with (?m) and a newline in it', () => {
    expect(re('(?m)\\Ab').test('a\nb')).toBe(false);
    expect(re('(?m)^b').test('a\nb')).toBe(true);
    expect(re('a\\z').test('a\nb')).toBe(false);
    expect(re('b\\z').test('a\nb')).toBe(true);
  });

  it('the control escapes mean what they say', () => {
    expect(re('a\\tb\\nc\\rd\\fe\\vf').test('a\tb\nc\rd\fe\vf')).toBe(true);
    expect(re('\\a\\e').test('\x07\x1b')).toBe(true);
  });

  it('\\p and \\P take a category, a script (with or without «Script=») and a one-letter form', () => {
    expect(re('^\\p{Lu}$').test('Á')).toBe(true);
    expect(re('^\\p{Greek}$').test('α')).toBe(true);
    expect(re('^\\p{Script=Greek}$').test('α')).toBe(true);
    expect(re('^\\pL$').test('x')).toBe(true);
    expect(re('^\\PL$').test('1')).toBe(true);
    expect(re('^\\P{ L }$').test('1')).toBe(true);
    expect(() => re('\\p{Nonsense}')).toThrow(/propiedad Unicode desconocida: Nonsense/);
    expect(() => re('\\pX')).toThrow(/desconocida/);
    expect(() => re('\\p{L')).toThrow(/\\p sin cerrar/);
    expect(() => re('\\p')).toThrow(/\\p incompleto/);
  });

  it('hexadecimal escapes: two, four or eight digits, or braces', () => {
    expect(re('^\\x41$').test('A')).toBe(true);
    expect(re('^\\u00e9$').test('é')).toBe(true);
    expect(re('^\\U0001F600$').test('😀')).toBe(true);
    expect(re('^\\x{1F600}$').test('😀')).toBe(true);
    expect(re('^\\u{e9}$').test('é')).toBe(true);
    expect(() => re('\\x4')).toThrow(/no válido/);
    expect(() => re('\\xZZ')).toThrow(/no válido/);
    expect(() => re('\\x{110000000}')).toThrow(/no válido/);
    expect(() => re('\\x{41')).toThrow(/sin cerrar/);
  });

  it('an escaped letter or digit that is not an escape is refused, punctuation is itself', () => {
    expect(() => re('\\q')).toThrow(/escape \\q no admitido/);
    expect(() => re('\\1')).toThrow(/escape \\1 no admitido/);
    expect(() => re('a\\')).toThrow(/barra invertida al final/);
    expect(re('^\\.\\*\\/\\#\\ \\é$').test('.*/# é')).toBe(true);
    expect(re('^\\.$').test('x')).toBe(false);
  });

  it('classes: negation, ranges, a leading ] as a literal, escapes and the POSIX names', () => {
    expect(re('^[^a-c]$').test('d')).toBe(true);
    expect(re('^[^a-c]$').test('b')).toBe(false);
    expect(re('^[]a]+$').test(']a]')).toBe(true);
    expect(re('^[a\\-z]$').test('-')).toBe(true);
    expect(re('^[a/(){}|]+$').test('/(){}|')).toBe(true);
    expect(re('^[[:alpha:][:digit:]]+$').test('a1')).toBe(true);
    expect(re('^[[:word:]]+$').test('a_1')).toBe(true);
    expect(re('^[[:space:]]$').test('\t')).toBe(true);
    expect(re('^[😀x]+$').test('😀x')).toBe(true);
  });

  it('classes that Rust has but this cannot translate are refused, each with its reason', () => {
    expect(() => re('[[:^alpha:]]')).toThrow(/POSIX negadas/);
    expect(() => re('[[:nonsense:]]')).toThrow(/clases anidadas/);
    expect(() => re('[[:constructor:]]')).toThrow(/clases anidadas/);
    expect(() => re('[[a]]')).toThrow(/clases anidadas/);
    expect(() => re('[a&&b]')).toThrow(/operaciones entre clases/);
    expect(() => re('[a~~b]')).toThrow(/operaciones entre clases/);
    expect(() => re('[a--b]')).toThrow(/operaciones entre clases/);
    expect(() => re('[abc')).toThrow(/clase sin cerrar/);
  });

  it('flags: (?i), (?m), (?s) and (?u), alone, with a group, and turned off again', () => {
    expect(re('(?i)abc').test('ABC')).toBe(true);
    expect(re('(?i:a)b').test('Ab')).toBe(true);
    expect(re('(?i:a)b').test('AB')).toBe(false);
    expect(re('(?m)^b$').test('a\nb\nc')).toBe(true);
    expect(re('^b$').test('a\nb\nc')).toBe(false);
    expect(re('(?s).').test('\n')).toBe(true);
    expect(re('(?s:.)\\n').test('\n\n')).toBe(true);
    expect(re('(?u)é').test('é')).toBe(true);
    expect(() => re('(?-u)é')).toThrow(/la opción \(\?u\)/);
    expect(re('(?i)a(?-i)b').test('Ab')).toBe(true);
    expect(re('(?i)a(?-i)b').test('AB')).toBe(false);
    expect(re('((?i)a)b').test('Ab')).toBe(true);
    expect(re('((?i)a)b').test('AB')).toBe(false);
    expect(() => re('(?x)a')).toThrow(/la opción \(\?x\) no está admitida/);
    expect(re('(?)a').test('a')).toBe(true);
  });

  it('a flag that changes nothing adds nothing, and a flag group in the middle lasts to the end of its group', () => {
    expect(re('a(?i)(?i)b').test('aB')).toBe(true);
    expect(re('(a(?i)b)c').test('aBc')).toBe(true);
    expect(re('(a(?i)b)c').test('aBC')).toBe(false);
  });

  it('groups: plain, named in either form, and non-capturing; lookarounds are refused', () => {
    expect(re('(a)(?P<n>b)(?<m>c)(?:d)').test('abcd')).toBe(true);
    expect(() => re('(?=a)')).toThrow(/grupo no admitido/);
    expect(() => re('(?<=a)b')).toThrow(/grupo no admitido/);
    expect(() => re('(?<!a)b')).toThrow(/grupo no admitido/);
    expect(() => re('(a')).toThrow(/paréntesis sin cerrar/);
    expect(() => re('a)')).toThrow(/paréntesis sin abrir/);
  });

  it('the dot is every character but a newline, and a slash is only a slash', () => {
    expect(re('^.$').test('\n')).toBe(false);
    expect(re('^.$').test('😀')).toBe(true);
    expect(re('a/b').test('a/b')).toBe(true);
    expect(re('(?s)^.$').test('\n')).toBe(true);
  });

  it('an alternation inside a flagged group keeps the flag for every alternative', () => {
    const r = re('(?:a(?i)b|c)d');
    expect(r.test('aBd')).toBe(true);
    expect(r.test('Cd')).toBe(true);
    expect(r.test('Ad')).toBe(false);
  });

  it('astral characters outside a class are single characters', () => {
    expect(re('^😀+$').test('😀😀')).toBe(true);
    expect(re('^.$').test('😀')).toBe(true);
  });

  it('the error says what was written and why, in Spanish', () => {
    try {
      rustRegex('(?x)', 'tag:re:(?x)');
    } catch (e) {
      expect(e).toBeInstanceOf(SearchError);
      expect((e as SearchError).kind).toBe('invalidRegex');
      expect((e as SearchError).message).toContain('`tag:re:(?x)`');
      expect((e as SearchError).message).toContain('la opción (?x) no está admitida');
      return;
    }
    throw new Error('did not throw');
  });
});
