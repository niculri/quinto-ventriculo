// The test quiz: two sections (original and new questions) with their groups and questions.
import type { QuizDetail, QuizSectionDetail } from '@qv/schema';
import { CATALOG } from './catalog';

const colors = (c: string) =>
  Object.fromEntries(['ac', 'ac-b', 'ac2', 'ac2-b', 'on-ac', 'g1', 'g2', 'g3'].map((k) => [k, c]));

export const QUIZ: QuizDetail = {
  ...CATALOG.semesters[1]!.courses[0]!.assessments[0]!.quizzes[0]!,
  kicker: 'Certamen 2 · Biología celular',
  heading: 'Practica para el <b>Certamen 2</b>',
  footer: 'Pie del test',
  theme: { light: colors('#1F6F75'), dark: colors('#6CC3C8') } as QuizDetail['theme'],
  sections: [
    {
      id: 'pautas',
      name: 'Pautas de años pasados',
      label: 'Pauta original',
      description: 'Las 3 preguntas de alternativas.',
      notice: 'Aviso de las pautas',
      groupsTitle: 'Qué temas practicar',
      questionCount: 3,
      hasChoices: true,
      groups: [
        { id: '01', name: 'Transcripción', topic: 'Clases 8 y 9', questionCount: 2 },
        { id: '02', name: 'Núcleo', questionCount: 1 },
      ],
    },
    {
      id: 'nuevas',
      name: 'Preguntas nuevas',
      label: 'Pregunta nueva',
      description: 'Una pregunta nueva.',
      groupsTitle: 'Qué clases practicar',
      listing: {
        title: 'Materia que no salía',
        items: ['Tema suelto', { title: 'Clase 8', items: ['Hebra molde'] }],
      },
      questionCount: 1,
      hasChoices: false,
      groups: [{ id: '01', name: 'Clase 8', questionCount: 1 }],
    },
  ],
};

export const QUIZ_SECTIONS: Record<string, QuizSectionDetail> = {
  pautas: {
    quizId: QUIZ.id,
    sectionId: 'pautas',
    groups: [
      {
        id: '01',
        name: 'Transcripción',
        topic: 'Clases 8 y 9',
        questions: [
          {
            id: 'D-p01-03',
            kind: 'choice',
            context: 'Un gel de RT-PCR.',
            prompt: '¿Qué muestra el gel?',
            options: ['Splicing alternativo', 'Nada', 'Otra cosa'],
            correct: 0,
            optionExplanations: [
              '<b>Verdadera.</b> Dos tamaños.',
              '<b>Falsa.</b> Hay bandas.',
              '<b>Falsa.</b> No.',
            ],
            explanation: 'La idea clave.',
            origin: 'Certamen 2021',
            figures: [
              {
                kind: 'svg',
                svg: '<svg viewBox="0 0 10 10" role="img" aria-label="Gel"><rect width="10" height="10" fill="var(--ink)"/></svg>',
                caption: 'Imagen recreada a partir de la original.',
              },
            ],
            figureBeside: true,
            fixedOrder: false,
          },
          {
            id: 'D-p02-04',
            kind: 'choice',
            prompt: '¿Dónde se une TBP?',
            options: ['A la caja TATA', 'Al ribosoma'],
            correct: 0,
            table: {
              rows: [
                [
                  { html: 'Hormona', header: true },
                  { html: '1 min', header: false, highlight: true },
                ],
              ],
            },
            figures: [],
            figureBeside: false,
            fixedOrder: false,
          },
        ],
      },
      {
        id: '02',
        name: 'Núcleo',
        questions: [
          {
            id: 'A-p04-36',
            kind: 'choice',
            prompt: '¿Qué es la lámina?',
            options: ['Filamentos intermedios', 'Microtúbulos'],
            correct: 0,
            figures: [
              {
                kind: 'image',
                media: 'tests/x.webp',
                src: '/api/media/tests/x.webp',
                width: 40,
                height: 20,
                alt: 'Micrografía',
              },
            ],
            figureBeside: false,
            fixedOrder: false,
          },
        ],
      },
    ],
  },
  nuevas: {
    quizId: QUIZ.id,
    sectionId: 'nuevas',
    groups: [
      {
        id: '01',
        name: 'Clase 8',
        questions: [
          {
            id: 'N01-01',
            kind: 'short',
            prompt: '¿Qué hebra se copia?',
            answer: 'La molde',
            figures: [],
            figureBeside: false,
          },
        ],
      },
    ],
  },
};
