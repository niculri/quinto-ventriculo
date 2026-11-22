// The texts of DayLine.

const count = (n: number, one: string, many: string) =>
  `${n.toLocaleString('es-CL')} ${n === 1 ? one : many}`;

export const dayLineStrings = {
  day: {
    missing: 'Ese día no existe.',
    failed: 'No se pudieron leer las tarjetas de ese día.',
    answers: (n: number) => count(n, 'respuesta', 'respuestas'),
    practice: (answers: string) => `${answers} de práctica, que no se guardan por tarjeta`,
    due: (date: string, cardsText: string) => `${date}: ${cardsText} por repasar.`,
    answered: (date: string, cardsText: string, answers: string) =>
      `${date}: respondiste ${cardsText} (${answers}).`,
    practiced: (date: string, practice: string) => `${date}: ${practice}.`,
    both: (date: string, cardsText: string, answers: string, practice: string) =>
      `${date}: respondiste ${cardsText} (${answers}) y ${practice}.`,
    longest:
      'Miércoles 30 de septiembre de 2026: respondiste 1.000 tarjetas (10.000 respuestas) y 5.000 respuestas de práctica, que no se guardan por tarjeta.',
    allDays: 'Ver todos los días',
  },
} as const;
