// The texts of StartForm.

import { plural } from '../../../../shared/lib/plural';

const questions = (n: number) => plural(n, 'pregunta', 'preguntas');

export const startFormStrings = {
  questions,
  cover: {
    start: 'Comenzar',
    total: (n: number) => `${questions(n)} en total`,
    chooseOne: 'Elige al menos uno',
  },
} as const;
