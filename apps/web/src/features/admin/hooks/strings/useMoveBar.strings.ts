// The texts of useMoveBar.

import { plural } from '../../../../shared/lib/plural';

export const useMoveBarStrings = {
  moved: (n: number, list: string) =>
    n === 0
      ? `Ya estaban en «${list}».`
      : `${plural(n, 'persona pasó', 'personas pasaron')} a «${list}».`,
  undone: (n: number) =>
    `Deshecho: ${plural(n, 'persona volvió', 'personas volvieron')} a su lista.`,
} as const;
