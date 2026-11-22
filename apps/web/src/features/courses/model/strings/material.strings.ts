// The texts of material.

import { pluralGrouped } from '../../../../shared/lib/plural';

export const materialStrings = {
  lectures: (n: number) => pluralGrouped(n, 'clase', 'clases'),
  seminars: (n: number) => pluralGrouped(n, 'seminario', 'seminarios'),
  others: (n: number) => pluralGrouped(n, 'otro', 'otros'),
} as const;
