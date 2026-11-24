// The texts of Figures.

const count = (n: number) => n.toLocaleString('es-CL');
const answers = (n: number) => `${count(n)} ${n === 1 ? 'respuesta' : 'respuestas'}`;

/** What the days counted were: the answers, and how many in Anki and in tests when there were tests. */
function parts(anki: number, tests: number): string {
  if (!tests) return answers(anki);
  if (!anki) return `${answers(tests)} en tests`;
  return `${answers(anki + tests)}, ${count(anki)} en Anki y ${count(tests)} en tests`;
}

export const figuresStrings = {
  figures: {
    empty: 'Tus días de estudio van a aparecer aquí.',
    /** «En la racha actual: 365 respuestas, 340 en Anki y 25 en tests». */
    split: ({ streak, anki, tests }: { streak: boolean; anki: number; tests: number }) =>
      `${streak ? 'En la racha actual' : 'En total'}: ${parts(anki, tests)}`,
  },
} as const;
