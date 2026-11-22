// The texts of PracticeRound.

export const practiceRoundStrings = {
  practice: {
    title: 'Practicar',
    back: 'Tarjetas',
    left: (n: number) => `Quedan ${n.toLocaleString('es-CL')}`,
    leftLong: (n: number) => `Practicar · quedan ${n.toLocaleString('es-CL')}`,
    noDates: 'Esta práctica no cambia las fechas de tus tarjetas.',
    doneLabel: 'las tarjetas',
    doneTitle: 'Terminaste la práctica',
    again: 'Practicar de nuevo',
  },
} as const;
