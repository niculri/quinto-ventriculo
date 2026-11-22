// The slugs of headings and the escaping of attribute values.
import { describe, expect, it } from 'vitest';
import { escapeAttribute, slugify } from '../text';

describe('slugify', () => {
  it('loses accents, case and punctuation, and joins the words with one dash', () => {
    expect(slugify('Núcleo celular: parte 1')).toBe('nucleo-celular-parte-1');
    expect(slugify('1.º parte')).toBe('1-parte');
    expect(slugify('  --¿Qué es?--  ')).toBe('que-es');
  });

  it('cuts at the maximum without leaving a dash at the end', () => {
    expect(slugify('abc def ghi', 7)).toBe('abc-def');
    expect(slugify('abc def ghi', 8)).toBe('abc-def');
    expect(slugify('abc def ghi', 9)).toBe('abc-def-g');
    expect(slugify('a'.repeat(100))).toHaveLength(64);
  });

  it('a heading with nothing a slug can keep is «section»', () => {
    expect(slugify('日本語')).toBe('section');
    expect(slugify('')).toBe('section');
    expect(slugify('---')).toBe('section');
  });
});

describe('escapeAttribute', () => {
  it('escapes the four characters that could end or open something, the ampersand first', () => {
    expect(escapeAttribute('a & "b" <c> &amp;')).toBe('a &amp; &quot;b&quot; &lt;c&gt; &amp;amp;');
    expect(escapeAttribute('plain')).toBe('plain');
  });
});
