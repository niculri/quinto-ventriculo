// `POST /api/client-error`: the pages that fail in the browsers, reported without a session.
import { ClientErrorBody } from '@qv/schema/http';
import type { ErrorCode } from '@qv/schema/http';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { ClientErrorRecorder } from '../ports/client-errors';
import { errorBudget } from '../services/client-errors';

const MAX_A_MINUTE = 60;

/** `ClientErrorBody` takes 1,024 UTF-16 units, three bytes each at most. */
const MAX_BODY_BYTES = 3 * 1024;

/** Before anything is read: the route has no session, so it never buffers what a stranger sends. */
export const clientErrorBodyLimit = bodyLimit({
  maxSize: MAX_BODY_BYTES,
  onError: (c) => c.body(null, 413),
});

/**
 * The handler of `POST /client-error`: 204 for anything well formed from the site itself (counted or not), 400 for
 * the rest, 403 from another origin, 413 from `clientErrorBodyLimit`. It never says whether the point was kept.
 */
export function clientErrorHandler(recorder: ClientErrorRecorder | undefined, now: () => number) {
  const take = errorBudget(MAX_A_MINUTE, now);
  return async (c: Context) => {
    c.header('Cache-Control', 'no-store');
    const origin = c.req.header('Origin');
    if (origin && origin !== new URL(c.req.url).origin) return c.body(null, 403);
    const report = ClientErrorBody.safeParse(await c.req.text().catch(() => ''));
    if (!report.success) {
      const code: ErrorCode = 'invalid_client_error';
      return c.json({ error: code, message: 'Ese informe no se puede guardar.' }, 400);
    }
    if (recorder && take()) recorder.record(report.data);
    return c.body(null, 204);
  };
}
