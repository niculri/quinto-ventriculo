// The limit on requests, before any route: a request with a token that verifies counts against its student, anything
// else (no token, a made-up one) against its address.
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { Dependencies } from '../dependencies';
import type { AppEnv } from '../env';
import { apiError } from '../http';
import { RATE_LIMIT_PERIOD } from '../ports/rateLimit';
import { verifiedSession } from './authenticate';

const RATE_LIMITED_MESSAGE =
  'Llegaron demasiados pedidos seguidos. Espera unos segundos y vuelve a intentarlo.';

/** Cloudflare puts the visitor's address in this header; without it (tests, Node) everyone shares one key. */
const clientAddress = (c: Context<AppEnv>) => c.req.header('CF-Connecting-IP') ?? 'unknown';

function tooManyRequests(c: Context<AppEnv>) {
  c.header('Retry-After', String(RATE_LIMIT_PERIOD));
  c.header('Cache-Control', 'no-store');
  return c.json(apiError('rate_limited', RATE_LIMITED_MESSAGE), 429);
}

/**
 * By student when the token verifies, so that a classroom behind one address does not share one limit; by address
 * otherwise, so that sending a token, real or made up, is no way around it. Each request counts once.
 */
export function limitRequests(deps: Dependencies) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const { user } = await verifiedSession(deps, c);
    const allowed = user
      ? await deps.studentRateLimit.allow(user.id)
      : await deps.addressRateLimit.allow(clientAddress(c));
    if (!allowed) return tooManyRequests(c);
    await next();
  });
}
