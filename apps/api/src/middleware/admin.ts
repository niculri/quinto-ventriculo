// The routes of the panel exist only for an administrator: anybody else gets a 404.
import { createMiddleware } from 'hono/factory';
import type { Dependencies } from '../dependencies';
import type { AppEnv } from '../env';
import { apiError } from '../http';

/** After `requireSession`; `enabled` is whether the part the route needs was configured. */
export const requireAdmin = (deps: Dependencies, enabled: boolean) =>
  createMiddleware<AppEnv>(async (c, next) => {
    // Never cached: a cached 404 would hide the panel from someone just made an administrator.
    c.header('Cache-Control', 'no-store');
    const token = c.get('token');
    if (!enabled || !(await deps.admins.isAdmin(token))) {
      return c.json(apiError('not_found', 'No existe esa ruta.'), 404);
    }
    // A write asks the database again instead of the remembered answer: a removed administrator changes nothing.
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      const stillAdmin = deps.admins.isAdminNow
        ? await deps.admins.isAdminNow(token)
        : await deps.admins.isAdmin(token);
      if (stillAdmin === null) {
        return c.json(
          apiError(
            'admin_unavailable',
            'No se pudo comprobar que sigues siendo administrador. Intenta de nuevo en un rato.',
          ),
          503,
        );
      }
      if (!stillAdmin) {
        return c.json(apiError('admin_only', 'Ya no eres administrador. Recarga la página.'), 403);
      }
    }
    await next();
  });
