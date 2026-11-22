// `POST /api/client-error`: the pages that fail in the browsers, reported without a session: the worst error, the app
// that does not start, comes before the login.
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { API_ROUTES as R, ClientErrorBody } from '@qv/schema/http';
import type { AppContext } from '../context';
import type { AppEnv } from '../env';
import { apiError } from '../http';
import { errorBudget } from '../services/clientErrors';

const MAX_A_MINUTE = 60;

/** `ClientErrorBody` takes 1,024 UTF-16 units, three bytes each at most. */
const MAX_BODY_BYTES = 3 * 1024;

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
    if (take()) deps.clientErrors.record(report.data);
    return c.body(null, 204);
  });
}
