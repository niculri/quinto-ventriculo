// Golden tests: the synthetic corpus (ordinary and hostile HTML, CSS values) through every sanitizer, CSS check and
// HTML-to-text form, against what each one gave when recorded; a difference changes what the site shows or indexes.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sanitizeCard, sanitizeNote, sanitizeSvg } from '../sanitize';
import { CARD_SAFE_VALUE, SVG_SAFE_VALUE } from '../sanitize/css';
import { notePlainText } from '../text/note';
import * as text from '../text';

const read = (name: string): unknown =>
  JSON.parse(readFileSync(join(import.meta.dirname, '../../test', name), 'utf8'));
const corpus = read('corpus.json') as { html: { id: string; html: string }[]; css: string[] };
const golden = {
  sanitize: read('golden/sanitize.json') as Record<string, Record<string, unknown>>,
  text: read('golden/text.json') as Record<string, Record<string, string>>,
  css: read('golden/css.json') as {
    sources: Record<string, string>;
    card: [string, boolean][];
    svg: [string, boolean][];
  },
};

const each = <T>(f: (html: string) => T) =>
  Object.fromEntries(corpus.html.map((c) => [c.id, f(c.html)]));

/** The images the fake store has; any other local name is a missing image. */
const KNOWN = new Set(['a.png', 'b c.png', 'img/ü.jpg', 'c.png']);
const resolve = async (name: string) =>
  KNOWN.has(name) ? { key: `cards/${encodeURIComponent(name)}.webp` } : null;

describe('the corpus', () => {
  it('has the ordinary content and the attacks, each once', () => {
    const ids = corpus.html.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(150);
    for (const g of Object.values({ ...golden.sanitize, ...golden.text })) {
      expect(Object.keys(g)).toEqual(ids);
    }
  });
});

describe('sanitizers', () => {
  it('a card', async () => {
    const out: Record<string, unknown> = {};
    for (const c of corpus.html) out[c.id] = await sanitizeCard(c.html, resolve);
    expect(out).toEqual(golden.sanitize.card);
  });

  it('a note', () => {
    expect(each(sanitizeNote)).toEqual(golden.sanitize.note);
  });

  it("a test's SVG figure", () => {
    expect(each(sanitizeSvg)).toEqual(golden.sanitize.svg);
  });
});

describe('CSS values', () => {
  it("a card's inline style", () => {
    expect(CARD_SAFE_VALUE.toString()).toBe(golden.css.sources.card);
    expect(golden.css.card.map(([v]) => [v, CARD_SAFE_VALUE.test(v)])).toEqual(golden.css.card);
  });

  it('an SVG presentation attribute', () => {
    expect(SVG_SAFE_VALUE.toString()).toBe(golden.css.sources.svg);
    expect(golden.css.svg.map(([v]) => [v, SVG_SAFE_VALUE.test(v)])).toEqual(golden.css.svg);
  });
});

describe('HTML to text', () => {
  const forms: Record<string, (html: string) => string> = {
    note: notePlainText,
    release: text.releasePlainText,
    anki: text.ankiPlainText,
    report: text.reportPlainText,
  };
  for (const [name, f] of Object.entries(forms)) {
    it(name, () => {
      expect(each(f)).toEqual(golden.text[name]);
    });
  }
});
