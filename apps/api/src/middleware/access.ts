// Whether the student is still invited: the database is asked, because a token stays valid up to an hour after a removal.
import { CONTACT_EMAIL } from '@qv/schema';
import type { ErrorCode } from '@qv/schema/http';
import type { Dependencies } from '../dependencies';
import { apiError } from '../http';
import type { Access } from '../ports/access';
import { UNAUTHENTICATED_MESSAGE } from './authenticate';
import type { Guard } from './guard';

type Refusal = { status: 401 | 403 | 503; code: ErrorCode; message: string };

const UNAVAILABLE: Refusal = {
  status: 503,
  code: 'access_unavailable',
  message: 'No se pudo comprobar tu acceso. Intenta de nuevo en un rato.',
};

/** What is not here (an answer the port does not have) is `UNAVAILABLE`, as it always was: the gate fails closed. */
const REFUSALS = new Map<Access, Refusal>([
  ['expired', { status: 401, code: 'unauthenticated', message: UNAUTHENTICATED_MESSAGE }],
  [
    'signed_out',
    {
      status: 401,
      code: 'unauthenticated',
      message:
        'Tu sesión se cerró, por ejemplo porque saliste en otro dispositivo. Sal y vuelve a entrar con tu cuenta @ug.uchile.cl.',
    },
  ],
  [
    'not_accepted',
    {
      status: 403,
      code: 'terms_not_accepted',
      message: 'Para ver el material, acepta los términos de uso y la política de privacidad.',
    },
  ],
  [
    'denied',
    {
      status: 403,
      code: 'not_invited',
      message: `Tu cuenta no tiene acceso a El Quinto Ventrículo. Si deberías tenerlo, escribe a ${CONTACT_EMAIL}.`,
    },
  ],
  ['unknown', UNAVAILABLE],
]);

export const checkAccess =
  (deps: Dependencies): Guard =>
  async (c) => {
    const access = await deps.access.check(c.get('token'));
    if (access === 'allowed') return undefined;
    c.header('Cache-Control', 'no-store');
    const { status, code, message } = REFUSALS.get(access) ?? UNAVAILABLE;
    return c.json(apiError(code, message), status);
  };
