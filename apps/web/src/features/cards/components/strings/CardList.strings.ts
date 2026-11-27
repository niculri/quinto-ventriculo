// The texts of CardList.

import { pluralGrouped } from '../../../../shared/lib/plural';

export const cardListStrings = {
  notes: (n: number) => pluralGrouped(n, 'nota', 'notas'),
  /** What a screen reader hears of a heading and its count, which are drawn apart but read as one line. */
  heading: (title: string, n: number) => `${title}, ${pluralGrouped(n, 'nota', 'notas')}`,
  list: {
    label: 'Tarjetas',
  },
} as const;
