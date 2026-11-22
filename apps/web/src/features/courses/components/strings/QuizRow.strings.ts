// The texts of QuizRow.

import { pluralGrouped } from '../../../../shared/lib/plural';

export const quizRowStrings = {
  questions: (n: number) => pluralGrouped(n, 'pregunta', 'preguntas'),
  sections: (n: number) => ` · ${n} secciones`,
  practice: 'Practicar',
} as const;
