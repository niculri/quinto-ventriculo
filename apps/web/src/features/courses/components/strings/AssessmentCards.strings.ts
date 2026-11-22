// The texts of AssessmentCards.

import { plural } from '../../model/plural';

export const assessmentCardsStrings = {
  tests: (n: number) => plural(n, 'test', 'tests'),
  questions: (n: number) => plural(n, 'pregunta', 'preguntas'),
  section: {
    notes: 'Apuntes',
    tests: 'Tests',
  },
} as const;
