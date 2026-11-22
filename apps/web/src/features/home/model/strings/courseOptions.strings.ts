// The texts of courseOptions.

export const courseOptionsStrings = {
  mine: {
    chooseSemester: 'Elige tu semestre',
    addable: (emoji: string, name: string, semester: string) => `${emoji} ${name} · ${semester}`,
  },
} as const;
