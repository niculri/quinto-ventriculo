// The texts of NoteRow.

export const noteRowStrings = {
  base: 'Base',
  anki: ' Anki',
  ankiOf: (note: string, left: number) => `Anki de ${note}${left ? `: ${left} para hoy` : ''}`,
  test: ' Test',
  testOf: (note: string) => `Test de ${note}`,
} as const;
