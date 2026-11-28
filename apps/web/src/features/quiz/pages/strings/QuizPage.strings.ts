// The texts of QuizPage.

export const quizPageStrings = {
  crumbs: {
    home: 'Inicio',
    tests: 'Tests',
  },
  tabTitle: (quiz: string, course: string) => `${quiz} · ${course}`,
} as const;
