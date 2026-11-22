// The panel's «Uso»: how the site is used, from the users' database and the anonymous points.
import { Hono } from 'hono';
import type { UsageReport } from '@qv/schema';
import { API_ROUTES as R } from '@qv/schema/http';
import type { AppContext } from '../../context';
import type { AppEnv } from '../../env';
import { apiError } from '../../http';

export function usageRoutes({ mw, services }: AppContext) {
  return new Hono<AppEnv>().get(R.usage.pattern, mw.session, mw.usageAdmin, async (c) => {
    const reading = await services.usage.read(c.get('token'));
    if (!reading.ok) {
      return c.json(
        apiError(
          'usage_unavailable',
          'No se pudieron leer las cifras de uso. Intenta de nuevo en un rato.',
        ),
        503,
      );
    }
    return c.json(reading.report satisfies UsageReport);
  });
}
