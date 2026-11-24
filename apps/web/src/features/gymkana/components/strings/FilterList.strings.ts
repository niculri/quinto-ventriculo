// The texts of FilterList.

import { pluralGrouped } from '../../../../shared/lib/plural';

export const filterListStrings = {
  stations: (n: number) => pluralGrouped(n, 'estación', 'estaciones'),
} as const;
