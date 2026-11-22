// The texts of RoundDone.

export const roundDoneStrings = {
  review: {
    doneTitle: 'Terminaste el repaso',
    again: 'Otro repaso',
    againTimes: (n: number) => ` · «Otra vez» ${n} ${n === 1 ? 'vez' : 'veces'}`,
  },
} as const;
