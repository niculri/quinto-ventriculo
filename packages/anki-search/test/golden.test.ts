/**
 * Every search against real Anki 25.9 (scripts/anki_search.py): the same cards, or an error where Anki gives
 * one. Searches that Anki accepts but this package refuses («unsupported») must throw a SearchError.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SearchError, compileSearch, parseSearch, searchNeeds, searchTerm } from '../src';
import type { SearchAnswer, SearchCard, SearchContext, SearchDeck, SearchNoteType } from '../src';

interface Golden {
  timing: { now: number; today: number; nextDayAt: number };
  learnAheadSecs: number;
  ignoreAccents?: boolean;
  decks: SearchDeck[];
  noteTypes: SearchNoteType[];
  cards: SearchCard[];
  revlog: { noteGuid: string; ord: number; ease: number; atMs: number }[];
  searches: { query: string; cards?: [string, number][]; error?: string; unsupported?: boolean }[];
  terms: {
    kind: 'deck' | 'tag' | 'note';
    value: string;
    term: string;
    cards?: [string, number][];
  }[];
}

function load(file: string) {
  const golden = JSON.parse(
    readFileSync(join(import.meta.dirname, 'golden', file), 'utf8'),
  ) as Golden;
  const answers: SearchAnswer[] = golden.revlog
    .filter((r) => r.ease >= 1 && r.ease <= 4)
    .map((r) => ({
      noteGuid: r.noteGuid,
      ord: r.ord,
      rating: r.ease as 1 | 2 | 3 | 4,
      atMs: r.atMs,
    }));
  const firstAnswerMs = new Map<string, number>();
  for (const a of answers) {
    const key = `${a.noteGuid}\u001f${a.ord}`;
    const prev = firstAnswerMs.get(key);
    if (prev === undefined || a.atMs < prev) firstAnswerMs.set(key, a.atMs);
  }
  const ctx: SearchContext = {
    decks: golden.decks,
    noteTypes: golden.noteTypes,
    timing: golden.timing,
    learnAheadSecs: golden.learnAheadSecs,
    answers,
    firstAnswerMs,
    ...(golden.ignoreAccents ? { ignoreAccents: true } : {}),
  };
  const run = (query: string): string[] => {
    const match = compileSearch(parseSearch(query), ctx);
    return golden.cards
      .filter(match)
      .map((c) => `${c.noteGuid}/${c.ord}`)
      .sort();
  };
  return { golden, run };
}

const keys = (cards: [string, number][]) => cards.map(([g, o]) => `${g}/${o}`).sort();

// The second file is the same collection with Anki's «Ignore accents in search» on (`--ignore-accents`).
for (const file of ['search.json', 'search-ignore-accents.json']) {
  const { golden, run } = load(file);
  const label = golden.ignoreAccents ? ' (ignoring accents)' : '';

  describe(`searches against Anki${label}`, () => {
    it('has a good number of searches', () => {
      expect(golden.searches.length).toBeGreaterThan(300);
      expect(!!golden.ignoreAccents).toBe(file !== 'search.json');
    });

    for (const s of golden.searches) {
      it(JSON.stringify(s.query), () => {
        if (s.unsupported) {
          expect(() => run(s.query)).toThrow(SearchError);
        } else if (s.error !== undefined) {
          expect(() => run(s.query)).toThrow(SearchError);
        } else {
          expect(run(s.query)).toEqual(keys(s.cards!));
        }
      });
    }
  });

  describe(`sidebar terms against Anki${label}`, () => {
    for (const t of golden.terms) {
      it(`${t.kind}: ${t.value}`, () => {
        expect(searchTerm(t.kind, t.value)).toBe(t.term);
        expect(run(t.term)).toEqual(keys(t.cards!));
      });
    }
  });
}

describe('searchNeeds', () => {
  it('asks for the longest rated: window and for introduced:', () => {
    expect(searchNeeds(parseSearch('rated:3 or (rated:10:2 -introduced:5)'))).toEqual({
      ratedDays: 10,
      introducedDays: 5,
    });
    expect(searchNeeds(parseSearch('árbol'))).toEqual({ ratedDays: null, introducedDays: null });
  });
});
