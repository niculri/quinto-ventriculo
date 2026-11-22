// The texts of material.

import { plural } from '../plural';

export const materialStrings = {
  lectures: (n: number) => plural(n, 'clase', 'clases'),
  seminars: (n: number) => plural(n, 'seminario', 'seminarios'),
  others: (n: number) => plural(n, 'otro', 'otros'),
} as const;
