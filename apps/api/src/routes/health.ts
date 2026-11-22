// `GET /api/health`, and `/api/health/deep` for an external monitor: public, saying only `ok` or `fail` per part.
import { Hono } from 'hono';
import { API_ROUTES as R } from '@qv/schema/http';
import type { Health } from '@qv/schema/http';
import type { AppContext } from '../context';
import type { AppEnv } from '../env';
import type { DeepHealthResult } from '../ports/health';

export function healthRoutes({ deps }: AppContext) {
  const routes = new Hono<AppEnv>();

  routes.get(R.health.pattern, (c) =>
    c.json((deps.version ? { ok: true, version: deps.version } : { ok: true }) satisfies Health),
  );

  if (deps.configured.deepHealth) {
    routes.get(R.deepHealth.pattern, async (c) => {
      const result = await deps.deepHealth.run();
      c.header('Cache-Control', 'no-store');
      return c.json(
        { ok: result.ok, checks: result.checks } satisfies DeepHealthResult,
        result.ok ? 200 : 503,
      );
    });
  }

  return routes;
}
