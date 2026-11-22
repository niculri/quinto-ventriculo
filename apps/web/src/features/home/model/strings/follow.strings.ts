// The texts of follow.

export const followStrings = {
  follow: {
    quiz: (answered: number, questions: number) => `Test a medias · ${answered} de ${questions}`,
    note: (course: string) => `Último apunte que abriste · ${course}`,
  },
} as const;
