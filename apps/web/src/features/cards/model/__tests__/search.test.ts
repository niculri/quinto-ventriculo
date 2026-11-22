// Tests the simple mode's plain search and the codes that find their note.

import { SearchError, parseSearch } from '@qv/anki-search';
import type * as AnkiSearch from '@qv/anki-search';
import type { SchedTiming } from '@qv/srs';
import { describe, expect, it, vi } from 'vitest';
import { browseCard } from '../../../../test/cardsFakes';
import { CARD_INDEX } from '../../../../test/fixtures/cards';
import { CATALOG } from '../../../../test/fixtures/catalog';
import { buildAnkiTree } from '../../../catalog/model/tree';
import { lectureOf } from '../../../catalog/model/scope';
import { explorerNotes } from '../explorer';
import {
  combineSearch,
  matchCards,
  noteByCode,
  parseQuery,
  searchContext,
  searchQuery,
  textKeys,
} from '../search';

const failures = vi.hoisted(() => ({ compile: null as Error | null, parse: null as Error | null }));

vi.mock('@qv/anki-search', async (original) => {
  const real = await original<typeof AnkiSearch>();
  return {
    ...real,
    parseSearch: (q: string) => {
      if (failures.parse) throw failures.parse;
      return real.parseSearch(q);
    },
    compileSearch: (...args: Parameters<typeof real.compileSearch>) => {
      if (failures.compile) throw failures.compile;
      return real.compileSearch(...args);
    },
  };
});

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

const TIMING: SchedTiming = { now: 1_800_000_000, today: 20_833, nextDayAt: 1_800_003_600 };
const ctx = () => searchContext([{ id: '20', name: 'Ramo' }], [], TIMING, 20, undefined, undefined);
const CARDS = [
  browseCard({ note: { guid: 'a', fields: ['vértebra', ''], sortField: 'vértebra' } }),
  browseCard({ note: { guid: 'b', fields: ['costilla', ''], sortField: 'costilla' } }),
];

function failing<T>(where: 'compile' | 'parse', error: Error, run: () => T): T {
  failures[where] = error;
  try {
    return run();
  } finally {
    failures[where] = null;
  }
}

describe('a search', () => {
  it('that is valid gives its node, and an invalid one its message', () => {
    const good = parseQuery('is:new');
    expect(good.node).not.toBeNull();
    expect(good.error).toBeNull();
    const bad = parseQuery('is:foo');
    expect(bad.node).toBeNull();
    expect(bad.error).toMatch(/^Búsqueda no válida/);
  });

  it('that fails without a search error still gives a message', () => {
    expect(failing('parse', new Error('boom'), () => parseQuery('x'))).toEqual({
      node: null,
      error: 'Error: boom',
    });
  });

  it('ignores the accents and reads the student’s answers and first answers', () => {
    const c = searchContext(
      [{ id: '20', name: 'Ramo', extra: 1 } as { id: string; name: string }],
      [],
      TIMING,
      15,
      [{ noteGuid: 'a', ord: 0, rating: 1, reviewedAt: '2026-11-01T00:00:00.000Z' }],
      [{ noteGuid: 'a', ord: 0, at: '2026-10-01T00:00:00.000Z' }],
    );
    expect(c.decks).toEqual([{ id: '20', name: 'Ramo' }]);
    expect(c.learnAheadSecs).toBe(900);
    expect(c.ignoreAccents).toBe(true);
    expect(c.answers).toEqual([
      { noteGuid: 'a', ord: 0, rating: 1, atMs: Date.parse('2026-11-01T00:00:00.000Z') },
    ]);
    expect([...(c.firstAnswerMs ?? new Map()).values()]).toEqual([
      Date.parse('2026-10-01T00:00:00.000Z'),
    ]);
    expect(ctx().answers).toEqual([]);
    expect(ctx().firstAnswerMs?.size).toBe(0);
  });

  it('finds the cards whose text matches, without the accents', () => {
    const node = parseSearch('vertebra');
    expect(matchCards(node, ctx(), CARDS)).toEqual([CARDS[0]]);
    expect([...textKeys(node, ctx(), CARDS).keys]).toEqual([CARDS[0]!.key]);
    expect(textKeys(node, ctx(), CARDS).error).toBeNull();
  });

  it('that cannot run against these cards gives its search error, and any other failure finds nothing', () => {
    const node = parseSearch('vertebra');
    const error = new SearchError('Búsqueda no válida: no aquí.');
    expect(failing('compile', error, () => matchCards(node, ctx(), CARDS))).toBe(error);
    expect(failing('compile', new Error('boom'), () => matchCards(node, ctx(), CARDS))).toEqual([]);
    expect(failing('compile', error, () => textKeys(node, ctx(), CARDS))).toEqual({
      keys: new Set(),
      error: 'Búsqueda no válida: no aquí.',
    });
    expect(failing('compile', new Error('boom'), () => textKeys(node, ctx(), CARDS))).toEqual({
      keys: new Set(),
      error: 'Error: boom',
    });
  });
});

describe('a term the sidebar adds', () => {
  it.each<[string, string, Parameters<typeof combineSearch>[2], boolean, string]>([
    ['replaces the search on a click', 'is:new', 'replace', false, 'tag:x'],
    ['is the whole search when there was none', '   ', 'and', false, 'tag:x'],
    [
      'adds with «and» around the search in parentheses',
      ' is:new ',
      'and',
      false,
      '(is:new) tag:x',
    ],
    ['adds with «or» as an alternative', 'is:new', 'or', false, '(is:new) OR tag:x'],
    ['negates the term with Alt', 'is:new', 'and', true, '(is:new) -tag:x'],
    ['negates a term that replaces', '', 'replace', true, '-tag:x'],
  ])('%s', (_, current, how, negate, out) => {
    expect(combineSearch(current, 'tag:x', how, negate)).toBe(out);
  });
});

describe('the simple mode’s search', () => {
  it.each([
    ['is empty for blanks', '   ', ''],
    [
      'quotes each word and escapes what has a meaning',
      ' a*b  "c" d_e\\ ',
      '"a\\*b" "\\"c\\"" "d\\_e\\\\"',
    ],
  ])('%s', (_, text, out) => {
    expect(searchQuery(text, false)).toBe(out);
  });

  it('with Anki’s syntax only trims the text', () => {
    expect(searchQuery('  tag:x  ', true)).toBe('tag:x');
  });
});

describe('a code', () => {
  const notes = [
    { note: { code: null } },
    { note: { code: 'T-PR-01-001' } },
  ] as unknown as Parameters<typeof noteByCode>[0];

  it('finds nothing when no note has it, and skips the notes without code', () => {
    expect(noteByCode(notes, 'PR-99-999')).toBeNull();
    expect(noteByCode(notes, '  pr-01-001.4 ')).toBe(notes[1]);
  });

  it('needs at least three parts', () => {
    expect(noteByCode(notes, 'PR-01')).toBeNull();
  });
});
