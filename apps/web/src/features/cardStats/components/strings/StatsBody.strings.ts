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
      ? `En total: ${count(answers)} ${answers === 1 ? 'respuesta' : 'respuestas'} (${time}) en ${count(days)} ${days === 1 ? 'día' : 'días'}.`
      : 'Todavía no has respondido ninguna de estas tarjetas.',
  advanced:
    'En «Modo avanzado» ves además el acierto de jóvenes y maduras por separado, y cuántas están reaprendiendo, suspendidas o enterradas.',
} as const;
