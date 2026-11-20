// The test catalog: Anatomía I and Biología celular with a note and a test, and the Anki tree of the test deck.
import type { AnkiTreeDeck, Catalog } from '@qv/schema';
import { DECK, WEEK } from './deck';

export const CARD_INDEX_HASH = 'abcdefabcdefabcdefabcdefabcdef12';

export const CATALOG: Catalog = {
  semesters: [
    {
      number: 1,
      name: '1° Semestre',
      courses: [
        {
          id: 'anatomia-1',
          semester: 1,
          name: 'Anatomía I',
          emoji: '🦴',
          position: 1,
          assessments: [
            {
              id: 'anatomia-1/certamen-1',
              courseId: 'anatomia-1',
              name: 'Certamen 1',
              position: 1,
              notes: [],
              quizzes: [],
              cardCount: 4,
            },
          ],
        },
      ],
    },
    {
      number: 2,
      name: '2° Semestre',
      courses: [
        {
          id: 'biologia-celular',
          semester: 2,
          name: 'Biología celular',
          emoji: '🧬',
          position: 1,
          assessments: [
            {
              id: 'biologia-celular/certamen-2',
              courseId: 'biologia-celular',
              name: 'Certamen 2',
              position: 2,
              notes: [
                {
                  id: 'AP-BC-C2-10',
                  slug: '10-nucleo-celular',
                  courseId: 'biologia-celular',
                  assessmentId: 'biologia-celular/certamen-2',
                  kind: 'lecture',
                  title: 'Núcleo celular',
                  position: 1,
                  updatedAt: '2026-10-30T12:00:00.000Z',
                },
                {
                  id: 'AP-BC-C2-11',
                  slug: '11-traduccion',
                  courseId: 'biologia-celular',
                  assessmentId: 'biologia-celular/certamen-2',
                  kind: 'lecture',
                  title: 'Traducción',
                  subtitle: 'Clase N.º 11',
                  position: 2,
                  updatedAt: '2026-10-31T12:00:00.000Z',
                },
              ],
              quizzes: [
                {
                  id: 'practica-biocel',
                  slug: 'practica',
                  courseId: 'biologia-celular',
                  assessmentId: 'biologia-celular/certamen-2',
                  title: 'Práctica de Biocel',
                  position: 1,
                  questionCount: 4,
                  sectionCount: 2,
                  updatedAt: '2026-10-31T12:00:00.000Z',
                },
              ],
              cardCount: 0,
            },
          ],
        },
        { id: 'fisica', semester: 2, name: 'Física', emoji: '🧲', position: 2, assessments: [] },
      ],
    },
  ],
  anki: {
    decks: [] as AnkiTreeDeck[],
    presets: [],
    noteTypes: [
      {
        id: '1',
        name: 'Prueba · Básica',
        kind: 'normal',
        occlusion: false,
        fields: ['Frente', 'Reverso'],
        templates: ['Directa'],
        sortField: 0,
      },
      {
        id: '2',
        name: 'Prueba · Cloze',
        kind: 'cloze',
        occlusion: false,
        fields: ['Texto', 'Extra'],
        templates: ['Cloze'],
        sortField: 0,
      },
      {
        id: '3',
        name: 'Prueba · Oclusión',
        kind: 'cloze',
        occlusion: true,
        fields: ['Oclusión', 'Imagen'],
        templates: ['Oclusión'],
        sortField: 0,
      },
    ],
  },
};

const tree = (
  id: string,
  name: string,
  parentId: string | null,
  level: Partial<AnkiTreeDeck>,
  cardCount = 4,
  preset = 'Default',
): AnkiTreeDeck => ({
  id,
  name,
  parentId,
  preset,
  semester: null,
  courseId: null,
  assessmentId: null,
  noteCount: cardCount === 4 ? 3 : 1,
  cardCount,
  ...level,
});
const inCourse = { semester: 1, courseId: 'anatomia-1' };
const inAssessment = { ...inCourse, assessmentId: 'anatomia-1/certamen-1' };
CATALOG.anki.decks = [
  tree('1', '() Medicina UCH', null, {}),
  tree('2', '() Medicina UCH::1° Semestre', '1', { semester: 1 }),
  tree('3', '() Medicina UCH::1° Semestre::🦴 Anatomía I', '2', inCourse),
  tree('4', '() Medicina UCH::1° Semestre::🦴 Anatomía I::Certamen 1', '3', inAssessment),
  tree('5', WEEK, '4', inAssessment),
  tree('20', DECK.fullName, '5', inAssessment),
  tree('21', `${DECK.fullName}::Extras`, '20', inAssessment, 1, 'Extras'),
];
// The note counts of each deck, as anki_deck_tree() gives them.
for (const d of CATALOG.anki.decks) {
  const notes = new Set(DECK.cards.filter((c) => c.deckId === d.id).map((c) => c.noteGuid));
  d.ownNoteCount = notes.size;
  d.exclusiveNoteCount = [...notes].filter((n) =>
    DECK.cards.filter((c) => c.noteGuid === n).every((c) => c.deckId === d.id),
  ).length;
  const below = new Set(
    CATALOG.anki.decks
      .filter((x) => x.name === d.name || x.name.startsWith(`${d.name}::`))
      .map((x) => x.id),
  );
  d.closedNoteCount = [...notes].filter((n) =>
    DECK.cards.filter((c) => c.noteGuid === n).every((c) => below.has(c.deckId)),
  ).length;
}
CATALOG.anki.presets = DECK.presets;
CATALOG.semesters[0]!.courses[0]!.assessments[0]!.cardIndex = {
  hash: CARD_INDEX_HASH,
  noteCount: 3,
  cardCount: 4,
  bytes: 900,
};
