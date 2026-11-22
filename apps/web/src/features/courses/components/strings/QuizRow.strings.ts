// The texts of QuizRow.

import { plural } from '../../model/plural';

export const quizRowStrings = {
  questions: (n: number) => plural(n, 'pregunta', 'preguntas'),
  sections: (n: number) => ` · ${n} secciones`,
  practice: 'Practicar',
} as const;
