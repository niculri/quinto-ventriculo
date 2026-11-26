// What every route is built from: the dependencies, the middlewares ready to use and the services that keep state.
import type { MiddlewareHandler } from 'hono';
import type { Dependencies } from './dependencies';
import type { AppEnv } from './env';
import { requireAdmin } from './middleware/admin';
import { revalidate } from './middleware/revalidate';
import { requireSession } from './middleware/session';
import { visibleContent } from './middleware/visibleContent';
import { contentVersionReader } from './services/contentVersion';
import type { ContentVersionReader } from './services/contentVersion';
import { publishedIds } from './services/publishedIds';
import type { PublishedIds } from './services/publishedIds';
import { siteSettingsReader } from './services/siteSettings';
import type { SiteSettingsReader } from './services/siteSettings';
import { usageReader } from './services/usageReader';
import type { UsageReader } from './services/usageReader';

interface Middlewares {
  session: MiddlewareHandler<AppEnv>;
  visibleContent: MiddlewareHandler<AppEnv>;
  /** After `visibleContent`: a 304 when nothing the students get changed. */
  revalidate: MiddlewareHandler<AppEnv>;
  /** The same for what does not depend on the courses turned off (the card changes). */
  revalidatePublished: MiddlewareHandler<AppEnv>;
  releasesAdmin: MiddlewareHandler<AppEnv>;
  announcementsAdmin: MiddlewareHandler<AppEnv>;
  settingsAdmin: MiddlewareHandler<AppEnv>;
  unpublishedAdmin: MiddlewareHandler<AppEnv>;
  usageAdmin: MiddlewareHandler<AppEnv>;
}

interface Services {
  settings: SiteSettingsReader;
  contentVersion: ContentVersionReader;
  publishedIds: PublishedIds;
  usage: UsageReader;
}

export interface AppContext {
  deps: Dependencies;
  mw: Middlewares;
  services: Services;
}

export function createContext(deps: Dependencies): AppContext {
  const settings = siteSettingsReader(deps);
  const contentVersion = contentVersionReader(deps);
  const { configured } = deps;
  return {
    deps,
    mw: {
      session: requireSession(deps),
      visibleContent: visibleContent(settings),
      revalidate: revalidate(deps, contentVersion, true),
      revalidatePublished: revalidate(deps, contentVersion, false),
      releasesAdmin: requireAdmin(deps, configured.releases),
      announcementsAdmin: requireAdmin(deps, configured.announcements),
      settingsAdmin: requireAdmin(deps, configured.settings),
      unpublishedAdmin: requireAdmin(deps, configured.unpublished),
      usageAdmin: requireAdmin(deps, configured.usageStats),
    },
    services: {
      settings,
      contentVersion,
      publishedIds: publishedIds(deps),
      usage: usageReader(deps),
    },
  };
}
