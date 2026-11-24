// Tests that the addresses of what is not published (no material, an empty part, a deck without cards) answer as an
// address made up, and that the admin mode opens what has material in the draft and nothing more.
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Catalog } from '@qv/schema';
import { adminKey } from '@qv/schema/http';
import { paths } from '../../../shared/lib/paths';
import { fakeApi } from '../../../test/fakes/api';
import { CATALOG } from '../../../test/fixtures/catalog';
import { DECK, WEEK } from '../../../test/fixtures/deck';
import { renderApp } from '../../../test/render';
import { localAdminRepository } from '../../admin/api/repository';
import { buildAnkiTree } from '../model/tree';
import type { CourseDeckNode } from '../model/tree';

afterEach(() => window.localStorage.clear());

const NOT_FOUND = 'Esta página no aparece ni en el Netter';
const EMPTY_DECK = '22';

/** The test catalog with a deck of the week that has no cards (in the draft, `cards` of them) and Física's assessment, empty. */
function withEmptyDeck(cards = 0): Catalog {
  const c = structuredClone(CATALOG);
  const week = c.anki.decks.find((d) => d.name === WEEK)!;
  c.anki.decks.push({
    ...week,
    id: EMPTY_DECK,
    name: `${WEEK}::Mazo vacío`,
    parentId: week.id,
    noteCount: cards,
    cardCount: cards,
  });
  const bio = c.semesters[1]!.courses[0]!.assessments[0]!;
  c.semesters[1]!.courses[1]!.assessments = [
    { ...bio, id: 'fisica/certamen-1', courseId: 'fisica', notes: [], quizzes: [], cardCount: 0 },
  ];
  return c;
}

const emptyDeck = buildAnkiTree(withEmptyDeck()).byId.get(EMPTY_DECK) as CourseDeckNode;
const PHYSICS = '/semesters/2/courses/fisica';
const ANATOMY = '/semesters/1/courses/anatomia-1';
const BIOLOGY = '/semesters/2/courses/biologia-celular';

const NOT_PUBLISHED = [
  // A semester without courses, and a course without anything.
  '/semesters/3',
  PHYSICS,
  `${PHYSICS}/anki`,
  `${PHYSICS}/anki/cards`,
  `${PHYSICS}/anki/stats`,
  `${PHYSICS}/assessments/certamen-1/notes`,
  `${PHYSICS}/assessments/certamen-1/tests`,
  `${PHYSICS}/assessments/certamen-1/gymkana`,
  `${PHYSICS}/notes/fluidos`,
  // The empty parts of assessments that have others: Anatomía I has a deck only, Biología celular no deck.
  `${ANATOMY}/assessments/certamen-1/notes`,
  `${ANATOMY}/assessments/certamen-1/tests`,
  `${BIOLOGY}/assessments/certamen-2/gymkana`,
  `${BIOLOGY}/anki`,
  `${BIOLOGY}/anki/cards`,
  // A deck without cards, its screens and its old address.
  paths.deck(emptyDeck.ref),
  paths.deckStudy(emptyDeck.ref),
  paths.deckStats(emptyDeck.ref),
  `/decks/${EMPTY_DECK}`,
];

const page = async () => {
  const main = await screen.findByRole('main');
  await waitFor(() => expect(main.querySelector('h1')).not.toBeNull());
  return main.innerHTML;
};

describe('what is not published', () => {
  it('answers each address as one made up', async () => {
    const api = () => fakeApi({ catalog: async () => withEmptyDeck() });
    const made = renderApp(`${PHYSICS}-inventada`, { api: api() });
    const madeUp = await page();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(NOT_FOUND);
    made.unmount();
    for (const url of NOT_PUBLISHED) {
      const view = renderApp(url, { api: api() });
      expect(await page(), url).toBe(madeUp);
      view.unmount();
    }
  });

  it('shows the menu of an address made up, and its old address stays where it is', async () => {
    const shown = async (url: string) => {
      const view = renderApp(url, { api: fakeApi({ catalog: async () => withEmptyDeck() }) });
      await page();
      const menu = screen.getByRole('navigation', { name: 'Menú del sitio' }).innerHTML;
      const at = view.router.state.location.pathname;
      view.unmount();
      return { menu, at };
    };
    const MADE_UP = '/semesters/2/courses/inventado';
    for (const [url, never] of [
      [PHYSICS, MADE_UP],
      [`${PHYSICS}/anki/cards`, `${MADE_UP}/anki/cards`],
      [`${PHYSICS}/assessments/certamen-1/notes`, `${MADE_UP}/assessments/certamen-1/notes`],
      [`${PHYSICS}/notes/fluidos`, `${MADE_UP}/notes/fluidos`],
      ['/semesters/3', '/semesters/9'],
      [paths.deck(emptyDeck.ref), `${paths.deck(emptyDeck.ref)}-inventado`],
      ['/courses/fisica', '/courses/inventado'],
    ] as const) {
      const [one, other] = [await shown(url), await shown(never)];
      expect(one.menu, url).toBe(other.menu);
      expect(one.at, url).toBe(url);
    }
  });

  it('a course page links no deck without cards', async () => {
    const c = structuredClone(CATALOG);
    const empty = { ...c.anki.decks[0]!, semester: 2, noteCount: 0, cardCount: 0 };
    const course = { ...empty, courseId: 'biologia-celular' };
    c.anki.decks.push(
      { ...empty, id: '30', name: '() Medicina UCH::2° Semestre', parentId: '1' },
      {
        ...course,
        id: '31',
        name: '() Medicina UCH::2° Semestre::🧬 Biología celular',
        parentId: '30',
      },
      {
        ...course,
        id: '32',
        name: '() Medicina UCH::2° Semestre::🧬 Biología celular::Certamen 2',
        parentId: '31',
        assessmentId: 'biologia-celular/certamen-2',
      },
    );
    renderApp(BIOLOGY, { api: fakeApi({ catalog: async () => c }) });
    const main = await screen.findByRole('main');
    await within(main).findByRole('heading', { level: 1, name: /Biología celular/ });
    const links = within(main)
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'));
    expect(links.length).toBeGreaterThan(0);
    expect(links.filter((href) => href?.includes('/anki'))).toEqual([]);
  });

  it('the deck with cards beside it opens', async () => {
    const tree = buildAnkiTree(withEmptyDeck());
    const week = [...tree.byId.values()].find((n) => n.name === WEEK) as CourseDeckNode;
    renderApp(paths.deck(week.ref), { api: fakeApi({ catalog: async () => withEmptyDeck() }) });
    expect(await screen.findByRole('heading', { level: 1 })).not.toHaveTextContent(NOT_FOUND);
  });

  it('in the admin mode, what has material in the draft opens, and what has nothing does not', async () => {
    window.localStorage.setItem('qv-admin-mode', 'admin');
    const draft: Catalog = {
      ...withEmptyDeck(3),
      adminOnly: { [adminKey('deck', EMPTY_DECK)]: ['draft'] },
    };
    const options = {
      admin: localAdminRepository({ admin: true }),
      adminApi: fakeApi({
        catalog: async () => draft,
        deck: async (id) => ({ ...DECK, id, name: 'Mazo vacío', fullName: `${WEEK}::Mazo vacío` }),
      }),
    };
    const opened = renderApp(paths.deck(emptyDeck.ref), options);
    // A deck inside a week has no page of its own: it opens its assessment's.
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Certamen 1');
    opened.unmount();
    renderApp('/semesters/3', options);
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(NOT_FOUND);
  });
});
