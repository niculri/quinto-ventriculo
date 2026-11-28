// A gymkana for the tests: the test catalog with Anatomía II, whose Certamen 2 has only its «Gymkana» deck of three
// stations (two regions, two sources, priorities 1 and 3), its card index and its cards.
import type { AnkiTreeDeck, Catalog, CardDetail, CardIndex } from '@qv/schema';
import { ApiRequestError } from '../../shared/lib/api';
import type { ApiClient } from '../../shared/lib/api';
import { fakeApi } from '../fakes/api';
import { CATALOG } from './catalog';

const GYM_INDEX_HASH = 'fedcbafedcbafedcbafedcbafedcba98';
export const GYM_PAGE = '/semesters/2/courses/anatomia-2/assessments/certamen-2/gymkana';
export const GYM_WRITE = `${GYM_PAGE}/write`;
export const GYM_CA = `${GYM_PAGE}?modo=ca`;
export const GYM_DECK = '32';

const ROOT = '() Medicina UCH::2° Semestre::🦴 Anatomía II';
const where = { semester: 2, courseId: 'anatomia-2', assessmentId: 'anatomia-2/certamen-2' };
const deck = (id: string, name: string, parentId: string, level: Partial<AnkiTreeDeck>) => ({
  id,
  name,
  parentId,
  preset: 'Gymkana',
  semester: null,
  courseId: null,
  assessmentId: null,
  noteCount: 3,
  cardCount: 3,
  ...level,
});

export const GYM_CATALOG: Catalog = structuredClone(CATALOG);
GYM_CATALOG.semesters[1]!.courses.push({
  id: 'anatomia-2',
  semester: 2,
  name: 'Anatomía II',
  emoji: '🦴',
  position: 3,
  assessments: [
    {
      id: 'anatomia-2/certamen-2',
      courseId: 'anatomia-2',
      name: 'Certamen 2',
      position: 2,
      notes: [],
      quizzes: [],
      cardCount: 3,
      cardIndex: { hash: GYM_INDEX_HASH, noteCount: 3, cardCount: 3, bytes: 500 },
    },
  ],
});
GYM_CATALOG.anki.decks.push(
  deck('30', ROOT, '2', { semester: 2, courseId: 'anatomia-2' }),
  deck('31', `${ROOT}::Certamen 2`, '30', where),
  deck(GYM_DECK, `${ROOT}::Certamen 2::Gymkana`, '31', where),
);
GYM_CATALOG.anki.noteTypes.push({
  id: '9',
  name: 'Prueba · Foto',
  kind: 'normal',
  occlusion: false,
  fields: ['Pregunta', 'Respuesta', 'Etiqueta', 'Prioridad'],
  templates: ['Foto'],
  sortField: 2,
});

const station = (guid: string, name: string, tags: string[], priority: string) => ({
  guid,
  noteTypeId: '9',
  tags,
  code: `T-PR-G2-${guid.slice(-1)}`,
  version: 1,
  createdAt: null,
  fields: ['', '', name, priority],
  sortField: name,
  cards: [{ ord: 0, deckId: GYM_DECK }],
  kind: 'photo' as const,
  topic: '¿Qué estructura señala el alfiler rojo?',
  front: '',
  back: name,
  thumb: null,
  labels: 0,
  origin: [],
});

export const GYM_INDEX: CardIndex = {
  version: 1,
  assessmentId: 'anatomia-2/certamen-2',
  noteTypes: [GYM_CATALOG.anki.noteTypes.at(-1)!],
  notes: [
    station('gym-1', 'Músculo recto lateral', ['orbita', 'atlas'], '1'),
    station('gym-2', 'Arteria carótida interna', ['cuello', 'modelo'], '1'),
    station('gym-3', 'Glándula parótida', ['cuello', 'atlas'], '3'),
    { ...station('gym-4', ' ', ['cuello'], '1') },
  ],
  gymkanas: [
    {
      deckId: GYM_DECK,
      regions: [
        { tag: 'orbita', label: 'Órbita' },
        { tag: 'cuello', label: 'Cuello' },
      ],
      sources: [
        { label: 'Atlas', tags: ['atlas'] },
        { label: 'Modelos', tags: ['modelo'] },
      ],
    },
  ],
};

const card = (guid: string, name: string): CardDetail => ({
  noteGuid: guid,
  ord: 0,
  deckId: GYM_DECK,
  code: `T-PR-G2-${guid.slice(-1)}`,
  version: 1,
  kind: 'basic',
  front: `<div class="encabezado">¿Qué estructura señala el alfiler rojo?</div>`,
  back: `<hr id="answer"><div class="respuesta"><b>${name}</b></div>`,
  css: '.card { background: #fff; }',
});

const CARDS: Record<string, CardDetail> = {
  'gym-1/0': card('gym-1', 'Músculo recto lateral'),
  'gym-2/0': card('gym-2', 'Arteria carótida interna'),
  'gym-3/0': card('gym-3', 'Glándula parótida'),
};

export function gymkanaApi(changes: Partial<ApiClient> = {}): ApiClient {
  return fakeApi({
    catalog: async () => GYM_CATALOG,
    cardIndex: async (assessmentId, hash) => {
      if (assessmentId === GYM_INDEX.assessmentId && hash === GYM_INDEX_HASH) return GYM_INDEX;
      throw new ApiRequestError(404, 'not_found', 'Las tarjetas de este certamen cambiaron.');
    },
    card: async (guid, ord) => {
      const c = CARDS[`${guid}/${ord}`];
      if (c) return c;
      throw new ApiRequestError(404, 'not_found', 'Esa tarjeta no existe.');
    },
    ...changes,
  });
}
