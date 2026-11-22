// Tests of search evaluation, sidebar terms, the Rust regex translator and the speed on 50 000 cards.
import { describe, expect, it } from 'vitest';
import { SearchError, compileSearch, parseSearch, searchTerm } from '..';
import type { SearchCard, SearchContext } from '..';
import { rustRegex } from '../text';

const ctx: SearchContext = {
  decks: [
    { id: '1', name: '() Medicina UCH::1° Semestre::🦴 Anatomía I' },
    { id: '2', name: '() Medicina UCH::1° Semestre::🦴 Anatomía I::Extras' },
    { id: '3', name: 'Raro::a_b*c' },
    { id: '4', name: 'Raro::aXbYYc' },
    { id: '5', name: 'and' },
    { id: '6', name: '-x' },
    { id: '7', name: 'a"b \\c' },
  ],
  noteTypes: [
    {
      id: 'b',
      name: 'Básico',
      kind: 'normal',
      fields: ['Anverso', 'Reverso'],
      templates: ['Tarjeta 1'],
    },
    { id: 'c', name: 'Cloze', kind: 'cloze', fields: ['Texto', 'Extra'], templates: ['Cloze'] },
  ],
  timing: { now: 1_800_000_000, today: 500, nextDayAt: 1_800_010_000 },
  learnAheadSecs: 1200,
};

function card(over: Partial<SearchCard> = {}): SearchCard {
  return {
    noteGuid: 'g',
    ord: 0,
    deckId: '1',
    noteTypeId: 'b',
    tags: [],
    fields: ['Árbol', 'x'],
    createdMs: null,
    type: 'new',
    queue: 'new',
    due: null,
    interval: 0,
    reps: 0,
    lapses: 0,
    flag: 0,
    stability: null,
    difficulty: null,
    lastReview: null,
    decay: null,
    ...over,
  };
}

const matches = (query: string, c: SearchCard) => compileSearch(parseSearch(query), ctx)(c);

describe('evaluation', () => {
  it('NULL like SQL: no memory state matches neither a property nor its negation', () => {
    const fresh = card();
    expect(matches('prop:s>5', fresh)).toBe(false);
    expect(matches('-prop:s>5', fresh)).toBe(false);
    expect(matches('-prop:r<0.9', fresh)).toBe(false);
    expect(matches('prop:s>5 or is:new', fresh)).toBe(true);
    expect(matches('-(prop:s>5 and is:review)', fresh)).toBe(true);
    const known = card({ stability: 3, difficulty: 5, type: 'review', queue: 'review', due: 500 });
    expect(matches('-prop:s>5', known)).toBe(true);
  });

  it('a group is unknown, not false, when nothing decides it: its negation matches nothing either', () => {
    const fresh = card();
    expect(matches('-(prop:s>5 and is:new)', fresh)).toBe(false);
    expect(matches('-(prop:s>5 or tag:nothing)', fresh)).toBe(false);
    expect(matches('-(prop:s>5 or tag:nothing)', card({ tags: ['nothing'] }))).toBe(false);
    expect(matches('-(prop:s>5 or tag:other)', card({ tags: ['nothing'] }))).toBe(false);
    expect(matches('-(tag:a or tag:b)', card({ tags: ['c'] }))).toBe(true);
  });

  it('LIKE folds only ASCII letters', () => {
    expect(matches('árbol', card())).toBe(false);
    expect(matches('ÁRBOL', card({ fields: ['árbol'] }))).toBe(false);
    expect(matches('ÁRBOL', card({ fields: ['ÁrBoL'] }))).toBe(true);
    expect(matches('VÉRTEBRA', card({ fields: ['Vértebra'] }))).toBe(false);
    expect(matches('nc:arbol', card())).toBe(true);
  });

  it('deck:filtered matches nothing; buried kinds are is:buried', () => {
    expect(matches('deck:filtered', card())).toBe(false);
    const buried = card({ queue: 'buried' });
    expect(matches('is:buried-manually', buried)).toBe(true);
    expect(matches('is:buried-sibling', buried)).toBe(true);
  });

  it('the cards of a deck and its subdecks', () => {
    const term = searchTerm('deck', '() Medicina UCH::1° Semestre::🦴 Anatomía I');
    expect(matches(term, card({ deckId: '1' }))).toBe(true);
    expect(matches(term, card({ deckId: '2' }))).toBe(true);
    expect(matches(term, card({ deckId: '3' }))).toBe(false);
    expect(matches('deck:Anatomía*', card())).toBe(false);
    expect(matches('deck:*Anatomía*', card())).toBe(true);
  });

  it('an invalid regular expression is a SearchError', () => {
    expect(() => parseSearch('"re:(a"')).toThrow(SearchError);
  });
});

describe('sidebar terms', () => {
  it('quotes and escapes like Anki', () => {
    expect(searchTerm('deck', '() Medicina UCH::1° Semestre')).toBe(
      '"deck:() Medicina UCH::1° Semestre"',
    );
    expect(searchTerm('deck', 'Raro::a_b*c')).toBe('deck:Raro::a\\_b\\*c');
    expect(searchTerm('deck', 'and')).toBe('deck:and');
    expect(searchTerm('deck', '-x')).toBe('deck:-x');
    expect(searchTerm('deck', 'a"b \\c')).toBe('"deck:a\\"b \\\\c"');
    expect(searchTerm('tag', 're:x')).toBe('tag:re\\:x');
    expect(searchTerm('tag', 'a_b')).toBe('tag:a\\_b');
    expect(searchTerm('note', 'Básico (y tarjeta invertida)')).toBe(
      '"note:Básico (y tarjeta invertida)"',
    );
    expect(searchTerm('card', 'Tarjeta 1')).toBe('"card:Tarjeta 1"');
    expect(searchTerm('is', 'due')).toBe('is:due');
    expect(searchTerm('flag', '1')).toBe('flag:1');
  });

  it('a deck term finds exactly that deck (and its subdecks)', () => {
    for (const deck of ctx.decks) {
      const node = parseSearch(searchTerm('deck', deck.name));
      expect(node.type).toBe('deck');
      const match = compileSearch(node, ctx);
      const found = ctx.decks.filter((d) => match(card({ deckId: d.id }))).map((d) => d.id);
      const expected = ctx.decks
        .filter((d) => d.name === deck.name || d.name.startsWith(`${deck.name}::`))
        .map((d) => d.id);
      expect(found).toEqual(expected);
    }
  });

  it('a tag term finds the tag and its children only', () => {
    const term = searchTerm('tag', 'a_b');
    expect(matches(term, card({ tags: ['a_b'] }))).toBe(true);
    expect(matches(term, card({ tags: ['A_B::c'] }))).toBe(true);
    expect(matches(term, card({ tags: ['aXb'] }))).toBe(false);
    expect(matches(term, card({ tags: ['a_bc'] }))).toBe(false);
  });
});

describe('Rust regular expressions in JavaScript', () => {
  const re = (p: string) => rustRegex(p);
  it('Unicode classes and word boundaries', () => {
    expect(re('(?i)\\bcafé\\b').test('un CAFÉ.')).toBe(true);
    expect(re('\\bcaf\\b').test('café')).toBe(false);
    expect(re('^\\d+$').test('٣٤')).toBe(true);
    expect(re('^\\w+$').test('ñandú')).toBe(true);
    expect(re('^[[:digit:]]+$').test('42')).toBe(true);
    expect(re('c\\x{e1}f').test('cáf')).toBe(true);
    expect(re('(?P<x>a)b').test('ab')).toBe(true);
  });

  it('dot does not match a newline unless (?s)', () => {
    expect(re('a.b').test('a\nb')).toBe(false);
    expect(re('a.b').test('a\rb')).toBe(true);
    expect(re('(?s)a.b').test('a\nb')).toBe(true);
  });

  it('inline flags in the middle reach every later alternative', () => {
    const r = re('a(?i)b|c');
    expect(r.test('aB')).toBe(true);
    expect(r.test('C')).toBe(true);
    expect(r.test('A')).toBe(false);
    expect(re('(?i)a(?-i)B').test('AB')).toBe(true);
    expect(re('(?i)a(?-i)B').test('Ab')).toBe(false);
  });

  it('invalid ones throw a SearchError', () => {
    expect(() => re('(')).toThrow(SearchError);
    expect(() => re('a[b')).toThrow(SearchError);
    expect(() => re('(?x)a b')).toThrow(SearchError);
  });
});

describe('speed', () => {
  it('50 000 cards in a few tens of milliseconds', { timeout: 120_000 }, () => {
    const words = [
      'vértebra',
      'lumbar',
      'Árbol',
      'bronquial',
      'cuerpo',
      'arco',
      'apófisis',
      'Atlas',
    ];
    const cards: SearchCard[] = [];
    for (let i = 0; i < 50_000; i++) {
      const w = (k: number) => words[(i * 7 + k * 3) % words.length]!;
      cards.push(
        card({
          noteGuid: `n${i}`,
          deckId: String((i % 7) + 1),
          tags: [`Anatomía::S${i % 12}`, 'control'],
          fields: [
            `${w(0)} ${w(1)} número ${i} con texto de relleno para que el campo tenga un largo típico`,
            `${w(2)} ${w(3)} y una explicación más larga del reverso de la tarjeta ${i}`,
          ],
          type: i % 3 === 0 ? 'review' : 'new',
          queue: i % 3 === 0 ? 'review' : 'new',
          due: i % 3 === 0 ? 490 + (i % 20) : null,
          stability: i % 3 === 0 ? 5 : null,
          difficulty: i % 3 === 0 ? 5 : null,
        }),
      );
    }
    const time = (query: string) => {
      let ms = Infinity;
      let found = 0;
      for (let i = 0; i < 3; i++) {
        const start = performance.now();
        const match = compileSearch(parseSearch(query), ctx);
        found = cards.filter(match).length;
        ms = Math.min(ms, performance.now() - start);
      }
      return { ms, found };
    };
    // Warm-up: the first runs build the per-card text caches.
    time('cuerpo');
    time('nc:cuerpo');
    const text = time('vértebra');
    const mixed = time('lumbar -arco tag:anatomía::s3 is:due');
    const wildcard = time('v*bra*lumbar or nc:apofisis');
    expect(text.found).toBeGreaterThan(0);
    expect(mixed.found).toBeGreaterThan(0);
    expect(wildcard.found).toBeGreaterThan(0);
    // Each one takes 5–25 ms; the loose bound only catches something gone really wrong on a busy machine.
    expect(text.ms).toBeLessThan(2000);
    expect(mixed.ms).toBeLessThan(2000);
    expect(wildcard.ms).toBeLessThan(2000);
  });
});

describe('what the context does not bring', () => {
  const answered = card({ noteGuid: 'x' });

  it('without answers, nobody has been rated, and without first answers nobody was introduced', () => {
    expect(matches('rated:1', answered)).toBe(false);
    expect(matches('introduced:1', answered)).toBe(false);
  });

  it('answers inside the window of days and with the asked rating are the ones that count', () => {
    const day = 86_400;
    const withAnswers = (atMs: number, rating: 1 | 2 | 3 | 4) => ({
      ...ctx,
      answers: [{ noteGuid: 'x', ord: 0, rating, atMs }],
    });
    const within = (ctx.timing.nextDayAt - day / 2) * 1000;
    const before = (ctx.timing.nextDayAt - 2 * day) * 1000;
    const run = (query: string, c: SearchContext) => compileSearch(parseSearch(query), c)(answered);
    expect(run('rated:1', withAnswers(within, 3))).toBe(true);
    expect(run('rated:1', withAnswers(before, 3))).toBe(false);
    expect(run('rated:1:1', withAnswers(within, 3))).toBe(false);
    expect(run('rated:1:3', withAnswers(within, 3))).toBe(true);
    expect(run('rated:2', withAnswers(before + 1, 3))).toBe(true);
  });

  it('the first answer is judged against the window of days', () => {
    const first = (atMs: number) => ({ ...ctx, firstAnswerMs: new Map([['x\u001f0', atMs]]) });
    const edge = (ctx.timing.nextDayAt - 86_400) * 1000;
    const run = (c: SearchContext) => compileSearch(parseSearch('introduced:1'), c)(answered);
    expect(run(first(edge + 1))).toBe(true);
    expect(run(first(edge))).toBe(false);
  });

  it('a card with a memory state but no review time and no due day has no retrievability', () => {
    const lost = card({ stability: 5, difficulty: 5, lastReview: null, due: null });
    expect(matches('prop:r>0', lost)).toBe(false);
    expect(matches('-prop:r>0', lost)).toBe(false);
  });
});

describe('the edges of what a search finds', () => {
  const day = 86_400;
  const opens = (ctx.timing.nextDayAt - day) * 1000;

  it('rated: counts an answer made when its window opens, which introduced: and added: do not', () => {
    const answered = card({ noteGuid: 'x' });
    const run = (query: string, c: SearchContext) => compileSearch(parseSearch(query), c)(answered);
    const answerAt = (atMs: number): SearchContext => ({
      ...ctx,
      answers: [{ noteGuid: 'x', ord: 0, rating: 3, atMs }],
    });
    expect(run('rated:1', answerAt(opens))).toBe(true);
    expect(run('rated:1', answerAt(opens - 1))).toBe(false);
    expect(matches('added:1', card({ createdMs: opens }))).toBe(false);
    expect(matches('added:1', card({ createdMs: opens + 1 }))).toBe(true);
  });

  it('is:due takes a learning card whose step ends at the learn-ahead limit, to the second', () => {
    const limit = ctx.timing.now + ctx.learnAheadSecs;
    const learning = (due: number) => card({ type: 'learn', queue: 'learn', due });
    expect(matches('is:due', learning(limit))).toBe(true);
    expect(matches('is:due', learning(limit + 1))).toBe(false);
  });

  it('flag: looks only at the three bits of the colour', () => {
    expect(matches('flag:3', card({ flag: 3 }))).toBe(true);
    expect(matches('flag:3', card({ flag: 8 + 3 }))).toBe(true);
    expect(matches('flag:3', card({ flag: 4 }))).toBe(false);
  });

  it('a field name that matches neighbouring fields is tested on them joined, but «not empty» looks at each one', () => {
    const blank = card({ fields: ['', ''] });
    const second = card({ fields: ['', 'x'] });
    expect(matches('*verso:_*', blank)).toBe(false);
    expect(matches('*verso:_*', second)).toBe(true);
    expect(matches('*verso:_', blank)).toBe(true);
    expect(matches('*verso:a*b', card({ fields: ['a', 'b'] }))).toBe(true);
    expect(matches('*verso:x', second)).toBe(false);
  });

  it('a field the card does not have is not tested', () => {
    expect(matches('reverso:re:undefined', card({ fields: ['x'] }))).toBe(false);
  });

  it('deck:filtered is the filtered decks, not a deck that is called that', () => {
    const named = { ...ctx, decks: [...ctx.decks, { id: '8', name: 'filtered' }] };
    expect(compileSearch(parseSearch('deck:filtered'), named)(card({ deckId: '8' }))).toBe(false);
  });

  it('the parts of a deck name lose the spaces and colons around them, and an empty part is «blank»', () => {
    const named = {
      ...ctx,
      decks: [
        { id: '8', name: 'Raro::x' },
        { id: '9', name: 'Top::blank' },
      ],
    };
    const run = (query: string, deckId: string) =>
      compileSearch(parseSearch(query), named)(card({ deckId }));
    expect(run('"deck:Raro::x "', '8')).toBe(true);
    expect(run('"deck: Raro :: x "', '8')).toBe(true);
    expect(run('deck:Top::', '9')).toBe(true);
  });

  it('a group that cannot be decided, inside a larger one, stays undecided: it neither makes the other part true nor false', () => {
    const fresh = card();
    expect(matches('(prop:s>5 and is:new) or tag:zzz', fresh)).toBe(false);
    expect(matches('(prop:s>5 and is:new) or is:new', fresh)).toBe(true);
  });
});
