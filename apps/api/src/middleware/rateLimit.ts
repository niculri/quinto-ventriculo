// The limits on requests: by student once the session is known, and by address for what comes without a session (the
// images, the health checks, the browsers' error reports and a token that does not verify).
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { Dependencies } from '../dependencies';
import type { AppEnv } from '../env';
import { apiError } from '../http';
import { RATE_LIMIT_PERIOD } from '../ports/rateLimit';
import { tokenFromHeader } from './authenticate';
import type { Guard } from './guard';

const RATE_LIMITED_MESSAGE =
  'Llegaron demasiados pedidos seguidos. Espera unos segundos y vuelve a intentarlo.';

/** Cloudflare puts the visitor's address in this header; without it (tests, Node) everyone shares one key. */
const clientAddress = (c: Context<AppEnv>) => c.req.header('CF-Connecting-IP') ?? 'unknown';

function tooManyRequests(c: Context<AppEnv>) {
  c.header('Retry-After', String(RATE_LIMIT_PERIOD));
  c.header('Cache-Control', 'no-store');
  return c.json(apiError('rate_limited', RATE_LIMITED_MESSAGE), 429);
}

/** By address, only what carries no session token: a classroom behind one address must not share a student's limit. */
export function limitAnonymous(deps: Dependencies) {
  return createMiddleware<AppEnv>(async (c, next) => {
    if (!tokenFromHeader(c.req.header('Authorization'))) {
      if (!(await deps.addressRateLimit.allow(clientAddress(c)))) return tooManyRequests(c);
    }
    await next();
  });
}

/** A token that does not verify counts against its address: sending made-up tokens is no way around the limit. */
export const limitRejectedToken =
  (deps: Dependencies, authenticate: Guard): Guard =>
  async (c) => {
    const refused = await authenticate(c);
    if (!refused || !tokenFromHeader(c.req.header('Authorization'))) return refused;
    return (await deps.addressRateLimit.allow(clientAddress(c))) ? refused : tooManyRequests(c);
  };

/** After the session is verified and before anything that asks the databases. */
export const limitStudent =
  (deps: Dependencies): Guard =>
  async (c) =>
    (await deps.studentRateLimit.allow(c.get('user').id)) ? undefined : tooManyRequests(c);
