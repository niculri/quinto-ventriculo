// The panel's «Ajustes»: which semesters and courses show. Read and changed by an administrator.
import { Hono } from 'hono';
import { SiteSettingsUpdate } from '@qv/schema';
import type { SiteSettings, SiteSettingsView } from '@qv/schema';
import { API_ROUTES as R, siteSemesters } from '@qv/schema/http';
import type { AppContext } from '../../context';
import type { AppEnv } from '../../env';
import { apiError } from '../../http';

export function siteSettingsRoutes({ deps, mw, services }: AppContext) {
  const routes = new Hono<AppEnv>();

  routes.get(R.siteSettings.pattern, mw.session, mw.settingsAdmin, async (c) => {
    const [settings, catalog] = await Promise.all([deps.settings.get(), deps.repository.catalog()]);
    return c.json({
      ...settings,
      semesters: siteSemesters(catalog, new Set(settings.hiddenCourses)),
    } satisfies SiteSettingsView);
  });

  routes.put(R.setSiteSettings.pattern, mw.session, mw.settingsAdmin, async (c) => {
    const body = SiteSettingsUpdate.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json(apiError('invalid_settings', 'Esos ajustes no son válidos.'), 400);
    }
    const { hiddenCourses } = body.data;
    if (hiddenCourses) {
      // A course that is already off stays valid even if it left the catalog: the panel sends the whole list back.
      const known = new Set([
        ...(await deps.repository.courses()).map((course) => course.id),
        ...(await deps.settings.get()).hiddenCourses,
      ]);
      if (!hiddenCourses.every((id) => known.has(id))) {
        return c.json(apiError('invalid_settings', 'Ese ramo no existe.'), 400);
      }
    }
    const saved = await deps.settings.set({ ...body.data, by: c.get('user').email });
    services.settings.forget();
    return c.json(saved satisfies SiteSettings);
  });

  return routes;
}
