// The texts of FilterList.

import { pluralGrouped } from '../../../../shared/lib/plural';

export const filterListStrings = {
  stations: (n: number, total: number) =>
    n === total
      ? pluralGrouped(total, 'estación', 'estaciones')
      : `${n.toLocaleString('es-CL')} de ${pluralGrouped(total, 'estación', 'estaciones')}`,
} as const;
