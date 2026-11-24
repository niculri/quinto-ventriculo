// The texts of DayBox.

const count = (n: number) => n.toLocaleString('es-CL');

export const dayBoxStrings = {
  today: ' · hoy',
  noStudy: 'Sin estudio',
  nothingDue: 'Nada por repasar',
  seeCards: 'Ver esas tarjetas',
  /** «20 respuestas: 15 de Anki y 5 de tests». */
  split: (whole: string, anki: number, tests: number) =>
    anki > 0 ? `${whole}: ${count(anki)} de Anki y ${count(tests)} de tests` : `${whole} de tests`,
  /** A group's count: its Anki answers, its questions of tests, or both. */
  part: (anki: number, tests: number) =>
    tests === 0
      ? count(anki)
      : anki === 0
        ? `${count(tests)} en tests`
        : `${count(anki)} + ${count(tests)} en tests`,
} as const;
