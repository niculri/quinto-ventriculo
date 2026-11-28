// The panel's «Errores»: the pages that failed in the browsers in the last 7 or 30 days, grouped by error.
import { Hono } from 'hono';
import type { ClientErrorsReport } from '@qv/schema';
import { API_ROUTES as R, ClientErrorsQuery } from '@qv/schema/http';
import type { AppContext } from '../../context';
import type { AppEnv } from '../../env';
import { apiError } from '../../http';
import { clientErrorsReport } from '../../services/clientErrors';

export function clientErrorsRoutes({ deps, mw }: AppContext) {
  return new Hono<AppEnv>().get(R.clientErrors.pattern, mw.session, mw.errorsAdmin, async (c) => {
    const query = ClientErrorsQuery.safeParse({ days: c.req.query('days') });
    if (!query.success) {
      return c.json(apiError('invalid_period', 'Ese periodo no existe: 7 o 30 días.'), 400);
    }
    try {
      const groups = await deps.clientErrorsReader.read(query.data.days);
      return c.json(clientErrorsReport(groups, query.data.days) satisfies ClientErrorsReport);
    } catch (e) {
      console.error(e);
      return c.json(
        apiError(
          'errors_unavailable',
          'No se pudieron leer los errores. Intenta de nuevo en un rato.',
        ),
        503,
      );
    }
  });
}
