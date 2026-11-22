// The texts of FinalDaysChoice.

export const finalDaysChoiceStrings = {
  finalDay: {
    days: (days: number) => (days === 1 ? '1 día' : `${days} días`),
    label: (days: string, name: string) => `${days} solo para repasar: ${name}`,
    newUntilWide: 'Nuevas hasta el ',
    newUntilNarrow: 'Hasta ',
    noNew: 'Sin nuevas',
    new: (n: number) => (n === 1 ? 'nueva' : 'nuevas'),
    aDay: ' al día',
  },
} as const;
