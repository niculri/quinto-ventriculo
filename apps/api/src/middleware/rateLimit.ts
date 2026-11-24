// The limit on requests, before any route: a request with a token that verifies counts against its student, anything
// else (no token, a made-up one) against its address, and the signed images against their address apart.
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { apiPaths } from '@qv/schema/http';
import type { Dependencies } from '../dependencies';
import type { AppEnv } from '../env';
import { apiError } from '../http';
import { RATE_LIMIT_PERIOD } from '../ports/rateLimit';
import { verifiedSession } from './authenticate';

const RATE_LIMITED_MESSAGE =
  'Llegaron demasiados pedidos seguidos. Espera unos segundos y vuelve a intentarlo.';

/** `/api/media/`: what every signed image's path starts with. */
const MEDIA = apiPaths.media('');

/**
 * The visitor's address as Cloudflare gives it, an IPv6 one cut to its /64 (one network, which can change the rest
 * at will); without the header (tests, Node) everyone shares one key.
 */
function addressKey(header: string | undefined): string {
  if (!header) return 'unknown';
  if (!header.includes(':') || header.includes('.')) return header;
  const [head, tail] = header.toLowerCase().split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = [
    ...left,
    ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0'),
    ...right,
  ];
  return `${groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ''))
    .join(':')}::/64`;
}

function tooManyRequests(c: Context<AppEnv>) {
  c.header('Retry-After', String(RATE_LIMIT_PERIOD));
  c.header('Cache-Control', 'no-store');
  return c.json(apiError('rate_limited', RATE_LIMITED_MESSAGE), 429);
}

/**
 * By student when the token verifies, so that a classroom behind one address does not share one limit; by address
 * otherwise, so that sending a token, real or made up, is no way around it. Each request counts once. A signed image
 * counts by address against a limit of its own, much higher: an <img> cannot say whose it is, a refused one stays
 * broken with no retry, and a whole faculty or a phone carrier can sit behind one address.
 */
export function limitRequests(deps: Dependencies) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const address = () => addressKey(c.req.header('CF-Connecting-IP'));
    let allowed: boolean;
    if (c.req.path.startsWith(MEDIA)) {
      allowed = await deps.mediaRateLimit.allow(address());
    } else {
      const { user } = await verifiedSession(deps, c);
      allowed = user
        ? await deps.studentRateLimit.allow(user.id)
        : await deps.addressRateLimit.allow(address());
    }
    if (!allowed) return tooManyRequests(c);
    await next();
  });
}
