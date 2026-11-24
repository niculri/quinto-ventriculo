// The texts of StatsBody.

const count = (n: number) => n.toLocaleString('es-CL');

export const statsBodyStrings = {
  sections: {
    cards: 'Tus tarjetas',
    periods: 'Respuestas, tiempo y acierto',
    activity: 'Respuestas por día',
    hard: 'Las que más te cuestan',
  },
  total: (answers: number, time: string, days: number) =>
    answers
      ? `Desde tu primer día aquí: ${count(answers)} ${answers === 1 ? 'respuesta' : 'respuestas'} en ${time}, ${count(days)} ${days === 1 ? 'día' : 'días'} con estudio.`
      : 'Todavía no respondes tarjetas de aquí.',
  advanced: 'En «Modo avanzado» ves además los estados, jóvenes y maduras por separado.',
} as const;
