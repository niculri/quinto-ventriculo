// The texts of InviteResultDialog.

import type { InviteRejection } from '../../../api/repository';
import { plural } from '../../../../../shared/lib/plural';

export const inviteResultDialogStrings = {
  result: {
    title: (list: string) => `Invitaciones a «${list}»`,
    added: (n: number) => plural(n, 'persona invitada', 'personas invitadas'),
    already: (n: number) => `, ${n} ya ${n === 1 ? 'estaba' : 'estaban'}`,
    rejected: (n: number) => ` y ${plural(n, 'correo rechazado', 'correos rechazados')}`,
    end: '.',
    came: 'Entraron',
    were: 'Ya estaban',
    wereWhy: 'se quedan en su lista, con su fecha',
    refused: 'Rechazados',
    empty: '(vacío)',
    reasons: {
      domain: 'no es @ug.uchile.cl',
      invalid: 'no es un correo',
      repeated: 'repetido en lo pegado',
      empty: 'vacío',
    } satisfies Record<InviteRejection, string>,
  },
} as const;
