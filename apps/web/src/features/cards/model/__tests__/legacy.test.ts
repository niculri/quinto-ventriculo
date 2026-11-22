// Tests where the old browser's URLs go: the deck a search starts with, the cards page of that deck or of the URL's
// card, and home when there is nothing to go to.
import type { AnkiTreeDeck, CardDetail, Catalog } from '@qv/schema';
import { describe, expect, it } from 'vitest';
import { CARDS } from '../../../../test/fixtures/cards';
import { CATALOG } from '../../../../test/fixtures/catalog';
import { DECK } from '../../../../test/fixtures/deck';
import { buildAnkiTree } from '../../../catalog/model/tree';
import { deckOfSearch, legacyTarget } from '../legacy';

const tree = buildAnkiTree(CATALOG);
const ASSESSMENT = '"deck:() Medicina UCH::1° Semestre::🦴 Anatomía I::Certamen 1"';
const OWN = `"deck:${DECK.fullName}"`;
const PAGE = '/semesters/1/courses/anatomia-1/anki/certamen-1/cards';
const CARD = CARDS['cloze-1/0']!;

const split = (url: string | null) => {
  const [path, search] = (url ?? '').split('?');
  return { path, params: Object.fromEntries(new URLSearchParams(search)) };
};
const target = (over: Partial<Parameters<typeof legacyTarget>[0]>) =>
  legacyTarget({
    tree,
    byDeck: null,
    note: null,
    open: undefined,
    card: { isError: false, data: undefined },
    ...over,
  });

describe('the deck of a search', () => {
  it('is the deck whose term is the whole search or its start, with the rest of the search', () => {
    expect(deckOfSearch(tree, OWN)).toMatchObject({ node: { id: '20' }, rest: '' });
    expect(deckOfSearch(tree, `${OWN}   is:new  tag:x`)).toMatchObject({
      node: { id: '20' },
      rest: 'is:new  tag:x',
    });
    expect(deckOfSearch(tree, `${ASSESSMENT} is:due`)).toMatchObject({
      node: { id: '4' },
      rest: 'is:due',
    });
  });

  it('is none when the term is not at the start, is cut, or is of a deck without a page', () => {
    expect(deckOfSearch(tree, `is:new ${OWN}`)).toBeNull();
    expect(deckOfSearch(tree, `${OWN}x`)).toBeNull();
    expect(deckOfSearch(tree, '"deck:() Medicina UCH"')).toBeNull();
    expect(deckOfSearch(tree, '')).toBeNull();
  });
});

describe('where an old URL goes', () => {
  it('a deck’s search goes to the cards of its assessment, in its unit, with the rest and the open card', () => {
    const byDeck = deckOfSearch(tree, `${OWN} is:new`);
    expect(split(target({ byDeck, open: '1:cloze-1' }))).toEqual({
      path: PAGE,
      params: { unit: 's1-semana-de-prueba/mazo-de-prueba', q: 'is:new', card: '1:cloze-1' },
    });
  });

  it('the assessment’s own search has no unit, and an empty rest is no search', () => {
    expect(split(target({ byDeck: deckOfSearch(tree, ASSESSMENT) }))).toEqual({
      path: PAGE,
      params: {},
    });
  });

  it('the search wins over the card of the URL', () => {
    const byDeck = deckOfSearch(tree, ASSESSMENT);
    expect(
      split(target({ byDeck, note: 'cloze-1', card: { isError: true, data: undefined } })).path,
    ).toBe(PAGE);
  });

  it('without a search nor a note, or with a card that failed, goes home', () => {
    expect(target({})).toBe('/home');
    expect(target({ note: 'cloze-1', card: { isError: true, data: CARD } })).toBe('/home');
  });

  it('waits while the card is on its way', () => {
    expect(target({ note: 'cloze-1' })).toBeNull();
  });

  it('a card goes to its deck’s cards, open when the URL names it', () => {
    expect(split(target({ note: 'cloze-1', card: { isError: false, data: CARD } }))).toEqual({
      path: PAGE,
      params: { unit: 's1-semana-de-prueba/mazo-de-prueba' },
    });
    expect(
      split(target({ note: 'cloze-1', open: '0:cloze-1', card: { isError: false, data: CARD } }))
        .params,
    ).toEqual({
      unit: 's1-semana-de-prueba/mazo-de-prueba',
      card: '0:cloze-1',
    });
  });

  it('a card of a deck that is not in the tree, or has no page, goes home', () => {
    const gone: CardDetail = { ...CARD, deckId: 'missing' };
    expect(target({ note: 'x', card: { isError: false, data: gone } })).toBe('/home');
    const noPage: CardDetail = { ...CARD, deckId: '2' };
    expect(target({ note: 'x', card: { isError: false, data: noPage } })).toBe('/home');
  });

  it('a deck with a page but no course or assessment page above it is its own scope', () => {
    const deck = (
      d: Partial<AnkiTreeDeck> & Pick<AnkiTreeDeck, 'id' | 'name' | 'parentId'>,
    ): AnkiTreeDeck => ({
      preset: 'Default',
      semester: null,
      courseId: null,
      assessmentId: null,
      noteCount: 1,
      cardCount: 1,
      ...d,
    });
    const catalog: Catalog = {
      ...CATALOG,
      anki: {
        ...CATALOG.anki,
        decks: [
          deck({ id: 'r', name: 'R', parentId: null }),
          deck({ id: 's', name: 'R::S', parentId: 'r' }),
          deck({ id: 'c', name: 'R::S::C', parentId: 's' }),
          deck({ id: 'a', name: 'R::S::C::A', parentId: 'c' }),
          deck({
            id: 'w',
            name: 'R::S::C::A::W',
            parentId: 'a',
            semester: 1,
            courseId: 'anatomia-1',
          }),
        ],
      },
    };
    const own = buildAnkiTree(catalog);
    const out = legacyTarget({
      tree: own,
      byDeck: null,
      note: 'x',
      open: undefined,
      card: { isError: false, data: { ...CARD, deckId: 'w' } },
    });
    expect(split(out)).toEqual({
      path: '/semesters/1/courses/anatomia-1/anki/a/w/cards',
      params: {},
    });
  });
});
