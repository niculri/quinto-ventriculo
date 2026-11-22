// The texts of InviteList.

import { plural } from '../../../../../shared/lib/plural';

export const inviteListStrings = {
  invited: {
    list: (list: string) => `Lista ${list}`,
    invitedCount: (n: number) => plural(n, 'invitado', 'invitados'),
    withAccount: (n: number) => plural(n, 'con cuenta', 'con cuenta'),
    removeList: 'Sacar la lista',
  },
} as const;
