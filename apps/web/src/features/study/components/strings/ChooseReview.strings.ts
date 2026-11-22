// The texts of ChooseReview.

import { pluralGrouped } from '../../../../shared/lib/plural';

const cards = (n: number) => pluralGrouped(n, 'tarjeta', 'tarjetas');

export const chooseReviewStrings = {
  cards,
  backTo: (label: string) => `Volver a ${label}`,
  review: {
    title: (label: string) => `Repaso final de ${label}`,
    nothingSeen:
      'Todavía no has visto tarjetas de este certamen. Cuando estudies algunas, podrás repasarlas aquí.',
    noDates: 'Este repaso no cambia las fechas de tus tarjetas.',
    allTitle: 'Todo lo visto',
    allText: 'Parte por lo que estás más cerca de olvidar.',
    hardTitle: 'Solo lo marcado y lo difícil',
    hardText: 'Las que marcaste para revisar y las que has fallado varias veces.',
  },
} as const;
