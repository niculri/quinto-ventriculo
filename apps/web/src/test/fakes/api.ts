// An API client that answers with the test fixtures; what a test changes goes in the argument.
import type { DeckDetail, SearchResponse } from '@qv/schema';
import { ApiRequestError } from '../../shared/lib/api';
import type { ApiClient } from '../../shared/lib/api';
import { CARDS, CARD_INDEX } from '../fixtures/cards';
import { CARD_INDEX_HASH, CATALOG } from '../fixtures/catalog';
import { DECK } from '../fixtures/deck';
import { NOTE } from '../fixtures/note';
import { QUIZ, QUIZ_SECTIONS } from '../fixtures/quiz';

const notAdmin = async (): Promise<never> => {
  throw new ApiRequestError(404, 'not_found', 'No existe esa ruta.');
};

function deckDetail(id: string): DeckDetail | null {
  const all = CATALOG.anki.decks;
  const d = all.find((x) => x.id === id);
  // Like the API: the root and the semesters have no course and no page.
  if (!d?.courseId) return null;
  const below = all.filter((x) => x.name.startsWith(`${d.name}::`));
  const ids = new Set([d.id, ...below.map((x) => x.id)]);
  return {
    ...DECK,
    id: d.id,
    name: d.name.split('::').at(-1)!,
    fullName: d.name,
    courseId: d.courseId,
    assessmentId: d.assessmentId,
    preset: d.preset,
    noteCount: d.noteCount,
    cardCount: d.cardCount,
    subdecks: below.map((x) => ({
      id: x.id,
      name: x.name.split('::').at(-1)!,
      parentId: x.parentId,
      preset: x.preset,
      cardCount: x.cardCount,
    })),
    cards: DECK.cards.filter((c) => ids.has(c.deckId)),
  };
}

export function fakeApi(changes: Partial<ApiClient> = {}): ApiClient {
  return {
    catalog: async () => CATALOG,
    note: async (slug) => {
      if (slug === NOTE.slug) return NOTE;
      throw new ApiRequestError(404, 'not_found', 'Ese apunte no existe.');
    },
    deck: async (id) => {
      const d = deckDetail(id);
      if (d) return d;
      throw new ApiRequestError(404, 'not_found', 'Ese mazo no existe.');
    },
    cardIndex: async (assessmentId, hash) => {
      if (assessmentId === CARD_INDEX.assessmentId && hash === CARD_INDEX_HASH) return CARD_INDEX;
      throw new ApiRequestError(404, 'not_found', 'Las tarjetas de este certamen cambiaron.');
    },
    thumbSignature: async () => ({
      prefix: 'cards/thumb/',
      expires: 4_102_444_800,
      query: 'e=4102444800&p=cards%2Fthumb%2F&s=prueba',
    }),
    cardChanges: async (since) => ({ changes: [], next: since, latest: since, more: false }),
    quizzes: async () => ({ quizzes: [] }),
    quiz: async (id) => {
      if (id === QUIZ.id) return QUIZ;
      throw new ApiRequestError(404, 'not_found', 'Ese test no existe.');
    },
    quizSection: async (id, section) => {
      const s = id === QUIZ.id ? QUIZ_SECTIONS[section] : undefined;
      if (s) return s;
      throw new ApiRequestError(404, 'not_found', 'Esa sección del test no existe.');
    },
    card: async (guid, ord) => {
      const c = CARDS[`${guid}/${ord}`];
      if (c) return c;
      throw new ApiRequestError(404, 'not_found', 'Esa tarjeta no existe.');
    },
    search: async (query): Promise<SearchResponse> => ({
      query,
      results: [
        {
          noteId: NOTE.id,
          noteSlug: NOTE.slug,
          noteTitle: NOTE.title,
          courseName: 'Biología celular',
          anchor: 'ribosomas',
          section: 'Ribosomas',
          snippet: 'Tienen dos ⟦subunidades⟧.',
          score: 1,
        },
      ],
    }),
    // Only for an administrator: anybody else gets «no existe». What the pages open is counted for anybody.
    releaseOverview: notAdmin,
    releaseCards: notAdmin,
    releaseArticles: notAdmin,
    releaseQuestions: notAdmin,
    releaseTexts: notAdmin,
    releaseMedia: notAdmin,
    setReleaseMark: notAdmin,
    publishRelease: notAdmin,
    revertRelease: notAdmin,
    releaseLog: notAdmin,
    siteSettings: notAdmin,
    setSiteSettings: notAdmin,
    unpublishedLog: notAdmin,
    usage: notAdmin,
    usageOpen: async () => ({ ok: true as const }),
    ...changes,
  };
}
