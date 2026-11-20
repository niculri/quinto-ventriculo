// The test deck: one week of the test course with a basic, a cloze and an occlusion note, and its Extras subdeck.
import type { DeckDetail } from '@qv/schema';

export const WEEK =
  '() Medicina UCH::1° Semestre::🦴 Anatomía I::Certamen 1::S1 - Semana de prueba';
export const DECK_PATH =
  '/semesters/1/courses/anatomia-1/anki/certamen-1/s1-semana-de-prueba/mazo-de-prueba';

export const DECK: DeckDetail = {
  id: '20',
  name: 'Mazo de prueba',
  fullName: `${WEEK}::Mazo de prueba`,
  description: '',
  courseId: 'anatomia-1',
  assessmentId: 'anatomia-1/certamen-1',
  preset: 'Default',
  noteCount: 3,
  cardCount: 4,
  subdecks: [{ id: '21', name: 'Extras', parentId: '20', preset: 'Extras', cardCount: 1 }],
  cards: [
    {
      noteGuid: 's@/AqX%n?#',
      ord: 0,
      deckId: '20',
      code: 'T-PR-01-001',
      version: 2,
      kind: 'basic',
      text: '¿Cuántas vértebras cervicales hay?',
    },
    {
      noteGuid: 'cloze-1',
      ord: 0,
      deckId: '20',
      code: 'T-PR-01-002',
      version: 1,
      kind: 'cloze',
      text: 'La columna tiene 7 vértebras cervicales',
    },
    {
      noteGuid: 'cloze-1',
      ord: 1,
      deckId: '21',
      code: 'T-PR-01-002',
      version: 1,
      kind: 'cloze',
      text: 'La columna tiene 7 vértebras cervicales',
    },
    {
      noteGuid: 'oclusion-1',
      ord: 0,
      deckId: '20',
      code: 'T-PR-01-003',
      version: 1,
      kind: 'occlusion',
      text: 'Vértebra de prueba',
    },
  ],
  presets: [
    {
      name: 'Default',
      config: {
        new: { delays: [1, 10], perDay: 20, bury: true },
        rev: { perDay: 100, bury: true, maxIvl: 36500 },
        lapse: { delays: [10], leechAction: 0, leechFails: 8 },
        maxTaken: 60,
      },
    },
    {
      name: 'Extras',
      config: {
        new: { delays: [1, 10], perDay: 0, bury: true },
        rev: { perDay: 100, bury: true, maxIvl: 36500 },
        lapse: { delays: [10], leechAction: 0, leechFails: 8 },
        maxTaken: 60,
      },
    },
  ],
};
