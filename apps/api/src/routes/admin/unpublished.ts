// The panel's «Fuera del sitio»: what was taken off, with whether each image is still in the media store.
import { Hono } from 'hono';
import type { UnpublishedLog } from '@qv/schema';
import { API_ROUTES as R } from '@qv/schema/http';
import type { AppContext } from '../../context';
import type { AppEnv } from '../../env';
import { isOnSite } from '../../services/media-presence';

/** At most this many images are asked to the store: each is a subrequest, and a Worker has a limit of them. */
const IMAGES_CHECKED = 40;

export function unpublishedRoutes({ deps, mw }: AppContext) {
  return new Hono<AppEnv>().get(
    R.unpublished.pattern,
    mw.session,
    mw.unpublishedAdmin,
    async (c) => {
      const log = await deps.unpublished.log();
      const keys = [
        ...new Set(log.entries.filter((e) => e.kind === 'image').map((e) => e.itemId)),
      ].slice(0, IMAGES_CHECKED);
      const there = new Map<string, boolean | null>();
      for (const key of keys) {
        let onSite: boolean | null;
        try {
          onSite = await isOnSite(deps.media, key);
        } catch {
          onSite = null;
        }
        there.set(key, onSite);
      }
      return c.json({
        ...log,
        entries: log.entries.map((e) =>
          e.kind === 'image' ? { ...e, onSite: there.get(e.itemId) ?? null } : e,
        ),
      } satisfies UnpublishedLog);
    },
  );
}
