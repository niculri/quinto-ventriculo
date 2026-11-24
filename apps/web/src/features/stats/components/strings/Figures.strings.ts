// The texts of Figures.

const count = (n: number) => n.toLocaleString('es-CL');
const answers = (n: number) => `${count(n)} ${n === 1 ? 'respuesta' : 'respuestas'}`;
const questions = (n: number) => `${count(n)} ${n === 1 ? 'pregunta' : 'preguntas'}`;

export const figuresStrings = {
  figures: {
    empty: 'Tus días de estudio van a aparecer aquí.',
    /** «En la racha actual: 340 respuestas de Anki y 25 preguntas de tests». */
    split: ({ streak, anki, tests }: { streak: boolean; anki: number; tests: number }) =>
      `${streak ? 'En la racha actual' : 'En total'}: ${answers(anki)} de Anki y ${questions(tests)} de tests`,
  },
} as const;
