// `POST /api/client-error`: the pages that fail in the browsers, with or without a session (the app that does not start
// fails before the login), plus the system and browser of the User-Agent and the account of a session that verifies.
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { API_ROUTES as R, CLIENT_ERROR_BODY_UNITS, ClientErrorBody } from '@qv/schema/http';
import type { AppContext } from '../context';
import type { AppEnv } from '../env';
import { apiError } from '../http';
import { verifiedSession } from '../middleware/authenticate';
import { errorBudget } from '../services/clientErrors';
import { browserLabels } from '../services/userAgent';

const MAX_A_MINUTE = 60;

/** `ClientErrorBody` takes `CLIENT_ERROR_BODY_UNITS` UTF-16 units, three bytes each at most. */
const MAX_BODY_BYTES = 3 * CLIENT_ERROR_BODY_UNITS;

/** Before anything is read: the route has no session, so it never buffers what a stranger sends. */
const limitBody = bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => c.body(null, 413) });

/**
 * 204 for anything well formed from the site itself (counted or not), 400 for the rest, 403 from another origin, 413
 * from the body limit. It never says whether the point was kept.
 */
export function clientErrorRoutes({ deps }: AppContext) {
  // `now` is in seconds; the budget counts minutes in milliseconds.
  const take = errorBudget(MAX_A_MINUTE, () => deps.now() * 1000);
  return new Hono<AppEnv>().post(R.clientError.pattern, limitBody, async (c) => {
    c.header('Cache-Control', 'no-store');
    const origin = c.req.header('Origin');
    if (origin && origin !== new URL(c.req.url).origin) return c.body(null, 403);
    const report = ClientErrorBody.safeParse(await c.req.text().catch(() => ''));
    if (!report.success) {
      return c.json(apiError('invalid_client_error', 'Ese informe no se puede guardar.'), 400);
    }
    if (take()) {
      // Already verified by the rate limit, which counts a request with a session by student: kept in the context.
      const { user } = await verifiedSession(deps, c);
      deps.clientErrors.record({
        ...report.data,
        ...browserLabels(c.req.header('User-Agent')),
        account: user?.id ?? null,
      });
    }
    return c.body(null, 204);
  });
}
