// Who is asking: the session token of the request, verified once per request (the limits ask first, the session after).
import type { Context } from 'hono';
import { BearerToken } from '@qv/schema/http';
import type { Dependencies } from '../dependencies';
import type { AppEnv, VerifiedSession } from '../env';
import { apiError } from '../http';
import type { Guard } from './guard';

export const UNAUTHENTICATED_MESSAGE = 'Entra con tu cuenta @ug.uchile.cl para ver esto.';

function tokenFromHeader(header: string | undefined | null): string | null {
  const token = BearerToken.safeParse(header);
  return token.success ? token.data : null;
}

/** The token of the request and its student (null if it does not verify), kept in the context for the next asker. */
export async function verifiedSession(
  deps: Dependencies,
  c: Context<AppEnv>,
): Promise<VerifiedSession> {
  const known = c.get('verified');
  if (known) return known;
  const token = tokenFromHeader(c.req.header('Authorization'));
  const verified = { token, user: token ? await deps.verifier.verify(token) : null };
  c.set('verified', verified);
  return verified;
}

export const authenticate =
  (deps: Dependencies): Guard =>
  async (c) => {
    const { token, user } = await verifiedSession(deps, c);
    if (!token || !user) {
      return c.json(apiError('unauthenticated', UNAUTHENTICATED_MESSAGE), 401);
    }
    c.set('user', user);
    c.set('token', token);
    return undefined;
  };
