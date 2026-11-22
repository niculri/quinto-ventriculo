// The texts of ChooseUnits.

export const chooseUnitsStrings = {
  units: {
    title: 'Qué estás estudiando · ',
    of: ' de ',
    on: (n: number) => (n === 1 ? 'activada' : 'activadas'),
    list: (deck: string) => `Semanas y clases de ${deck}`,
  },
} as const;
