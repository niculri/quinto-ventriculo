// Who is asking: the session token of the request, verified.
import { BearerToken } from '@qv/schema/http';
import type { Dependencies } from '../dependencies';
import { apiError } from '../http';
import type { Guard } from './guard';

export const UNAUTHENTICATED_MESSAGE = 'Entra con tu cuenta @ug.uchile.cl para ver esto.';

function tokenFromHeader(header: string | undefined | null): string | null {
  const token = BearerToken.safeParse(header);
  return token.success ? token.data : null;
}

export const authenticate =
  (deps: Dependencies): Guard =>
  async (c) => {
    const token = tokenFromHeader(c.req.header('Authorization'));
    const user = token ? await deps.verifier.verify(token) : null;
    if (!token || !user) {
      return c.json(apiError('unauthenticated', UNAUTHENTICATED_MESSAGE), 401);
    }
    c.set('user', user);
    c.set('token', token);
    return undefined;
  };
