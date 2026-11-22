// The texts of CardList.

import { pluralGrouped } from '../../../../shared/lib/plural';

export const cardListStrings = {
  notes: (n: number) => pluralGrouped(n, 'nota', 'notas'),
  list: {
    label: 'Tarjetas',
  },
} as const;
