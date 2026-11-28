// The texts of usage.

export const usageStrings = {
  few: 'menos de 5',
  none: '—',
  rows: {
    activeStudents: 'Alumnos activos',
    newStudents: 'Alumnos nuevos',
    ankiAnswers: 'Respuestas de Anki',
    newCards: 'Tarjetas nuevas vistas',
    roundsStarted: 'Rondas de tests empezadas',
    roundsFinished: 'Rondas de tests terminadas',
  },
  openRows: {
    notes: 'Apuntes abiertos',
    decks: 'Mazos abiertos',
    quizzes: 'Tests abiertos',
    searches: 'Búsquedas',
  },
  periods: {
    today: 'Hoy',
    last7: '7 días',
    last30: '30 días',
  },
  details: {
    deck: (id: string) => `Mazo ${id}`,
    gymkana: (assessment: string) => `Gymkana del ${assessment}: Modo CA`,
  },
} as const;
