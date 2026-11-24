// The texts of AssessmentCards.

import { pluralGrouped } from '../../../../shared/lib/plural';

export const assessmentCardsStrings = {
  tests: (n: number) => pluralGrouped(n, 'test', 'tests'),
  questions: (n: number) => pluralGrouped(n, 'pregunta', 'preguntas'),
  stations: (n: number) => pluralGrouped(n, 'estación', 'estaciones'),
  section: {
    notes: 'Apuntes',
    tests: 'Tests',
    gymkana: 'Gymkana',
  },
} as const;
