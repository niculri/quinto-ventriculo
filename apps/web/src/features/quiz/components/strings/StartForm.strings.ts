// The texts of StartForm.

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const questions = (n: number) => plural(n, 'pregunta', 'preguntas');

export const startFormStrings = {
  questions,
  cover: {
    start: 'Comenzar',
    total: (n: number) => `${questions(n)} en total`,
    chooseOne: 'Elige al menos uno',
  },
} as const;
