// The HTTP API under /api: session, content reads, signed media, usage counts and the administration routes.
// It does not depend on Cloudflare: it runs the same on the Worker, in Node and in tests.
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { API_PREFIX } from '@qv/schema/http';
import { createContext } from './context';
import { resolveDependencies } from './dependencies';
import type { AppOptions } from './dependencies';
import type { AppEnv } from './env';
import { apiError } from './http';
import { limitRequests } from './middleware/rateLimit';
import { announcementsRoutes } from './routes/admin/announcements';
import { cardQualityRoutes } from './routes/admin/cardQuality';
import { releasesRoutes } from './routes/admin/releases';
import { siteSettingsRoutes } from './routes/admin/siteSettings';
import { unpublishedRoutes } from './routes/admin/unpublished';
import { usageRoutes } from './routes/admin/usage';
import { clientErrorsRoutes } from './routes/admin/clientErrors';
import { ankiRoutes } from './routes/anki';
import { cardIndexRoutes } from './routes/cardIndex';
import { catalogRoutes } from './routes/catalog';
import { clientErrorRoutes } from './routes/clientError';
import { healthRoutes } from './routes/health';
import { mediaRoutes } from './routes/media';
import { meRoutes } from './routes/me';
import { newsRoutes } from './routes/news';
import { notesRoutes } from './routes/notes';
import { quizzesRoutes } from './routes/quizzes';
import { usageOpenRoutes } from './routes/usageOpen';

export function createApp(options: AppOptions) {
  const ctx = createContext(resolveDependencies(options));
  const app = new Hono<AppEnv>().basePath(API_PREFIX);

  app.use('*', secureHeaders({ crossOriginResourcePolicy: 'same-origin' }));
  app.use('*', limitRequests(ctx.deps));
  app.onError((err, c) => {
    console.error(err);
    return c.json(apiError('internal', 'Algo salió mal. Intenta de nuevo en un rato.'), 500);
  });
  app.notFound((c) => c.json(apiError('not_found', 'No existe esa ruta.'), 404));

  for (const routes of [
    healthRoutes,
    meRoutes,
    catalogRoutes,
    notesRoutes,
    ankiRoutes,
    cardIndexRoutes,
    quizzesRoutes,
    siteSettingsRoutes,
    unpublishedRoutes,
    clientErrorRoutes,
    usageOpenRoutes,
    usageRoutes,
    clientErrorsRoutes,
    cardQualityRoutes,
    releasesRoutes,
    announcementsRoutes,
    newsRoutes,
    mediaRoutes,
  ]) {
    app.route('/', routes(ctx));
  }

  return app;
}
