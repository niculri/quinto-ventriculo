// The texts of usageChart.

export const usageChartStrings = {
  units: {
    activeStudents: ['alumno activo', 'alumnos activos'],
    newStudents: ['alumno nuevo', 'alumnos nuevos'],
    ankiAnswers: ['respuesta de Anki', 'respuestas de Anki'],
    newCards: ['tarjeta nueva vista', 'tarjetas nuevas vistas'],
    roundsStarted: ['ronda de tests empezada', 'rondas de tests empezadas'],
    roundsFinished: ['ronda de tests terminada', 'rondas de tests terminadas'],
    notes: ['apunte abierto', 'apuntes abiertos'],
    decks: ['mazo abierto', 'mazos abiertos'],
    quizzes: ['test abierto', 'tests abiertos'],
    searches: ['búsqueda', 'búsquedas'],
  },
  few: (unit: string) => `menos de 5 ${unit}`,
  day: (weekday: string, day: string, month: string) => `${weekday} ${day} de ${month}`,
  week: (day: string) => `Semana del ${day}`,
  name: (when: string, value: string, detail: string | null) =>
    `${when}: ${value}${detail ? `; ${detail}` : ''}`,
} as const;
