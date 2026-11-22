// The texts of FinalReview.

export const finalReviewStrings = {
  review: {
    bar: 'Repaso final',
    left: (n: number) => `Repaso final · quedan ${n.toLocaleString('es-CL')}`,
  },
} as const;
