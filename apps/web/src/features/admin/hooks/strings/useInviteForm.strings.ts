// The texts of useInviteForm.

import { plural } from '../../../../shared/lib/plural';

export const useInviteFormStrings = {
  form: {
    tooMany: (n: number, max: number) => `Son ${n} correos: a lo más ${max} por vez.`,
    count: (emails: number, ignored: number) =>
      `${plural(emails, 'correo', 'correos')}${
        ignored
          ? ` (${ignored === 1 ? '1 palabra no es un correo' : `${ignored} palabras no son correos`})`
          : ''
      }`,
  },
} as const;
