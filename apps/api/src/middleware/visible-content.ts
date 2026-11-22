// On every route that gives material: it answers as if the courses turned off by the administrators were gone.
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../env';
import { apiError } from '../http';
import { hideCourses } from '../services/hide-courses';
import type { SiteSettingsReader } from '../services/site-settings';

/** After `requireSession`. */
export const visibleContent = (settings: SiteSettingsReader) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const current = await settings.read();
    if (!current) {
      c.header('Cache-Control', 'no-store');
      return c.json(
        apiError('settings_unavailable', 'No se pudo leer el sitio. Intenta de nuevo en un rato.'),
        503,
      );
    }
    c.set('settings', current);
    // The administrator in the admin mode sees what is off too (the catalog says which is which).
    const hidden = new Set(c.get('preview') ? [] : current.hiddenCourses);
    c.set('hidden', hidden);
    c.set('repository', hideCourses(c.get('repository'), hidden));
    await next();
  });
