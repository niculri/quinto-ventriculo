// The texts of Results.

export const resultsStrings = {
  results: {
    of: ' de ',
    answered: ' respondidas',
    right: 'buenas',
    wrong: 'malas',
    percent: 'correctas',
    bar: (percent: number) => `${percent} % de respuestas correctas`,
    repeatAll: 'Repetir todo',
    repeatWrong: 'Repetir solo las malas',
    home: 'Volver al inicio',
    toReview: 'Para repasar (',
    clean: 'Sin errores. Todas las respuestas fueron correctas.',
  },
} as const;
