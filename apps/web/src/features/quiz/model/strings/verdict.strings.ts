// The texts of verdict.

export const verdictStrings = {
  verdict: {
    right: 'Correcta',
    wrong: (letter: string) => `Incorrecta. La correcta es la ${letter}`,
    knew: 'La sabías',
    review: 'Para repasar',
  },
} as const;
