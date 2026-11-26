// The panel's announcements: all of them with their status, one about the site written by hand, saving again the one
// of a release whose saving failed, and withdrawing one.
import { Hono } from 'hono';
import {
  SaveAnnouncementRequest,
  WithdrawAnnouncementRequest,
  announcementStatus,
} from '@qv/schema';
import type { AdminAnnouncement, AdminAnnouncements, AnnouncementRow } from '@qv/schema';
import { API_ROUTES as R } from '@qv/schema/http';
import type { AppContext } from '../../context';
import type { AppEnv } from '../../env';
import { apiError } from '../../http';

export function announcementsRoutes({ deps, mw }: AppContext) {
  const routes = new Hono<AppEnv>();
  const panel = [mw.session, mw.announcementsAdmin] as const;
  const withStatus = ({ releaseStatus: _status, ...row }: AnnouncementRow): AdminAnnouncement => ({
    ...row,
    status: announcementStatus({ ...row, releaseStatus: _status }, deps.now() * 1000),
  });

  routes.get(R.announcements.pattern, ...panel, async (c) =>
    c.json({
      announcements: (await deps.announcements.list()).map(withStatus),
    } satisfies AdminAnnouncements),
  );

  routes.post(R.saveAnnouncement.pattern, ...panel, async (c) => {
    const body = SaveAnnouncementRequest.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json(apiError('invalid_announcement', 'Ese anuncio no es válido.'), 400);
    }
    const saved = await deps.announcements.save({ ...body.data, by: c.get('user').email });
    if (saved === 'release') {
      return c.json(apiError('announcement_release', 'Esa publicación ya no está publicada.'), 409);
    }
    return c.json(withStatus(saved) satisfies AdminAnnouncement);
  });

  routes.post(R.withdrawAnnouncement.pattern, ...panel, async (c) => {
    const body = WithdrawAnnouncementRequest.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json(apiError('invalid_announcement', 'Ese anuncio no es válido.'), 400);
    }
    const saved = await deps.announcements.withdraw(body.data.id, c.get('user').email);
    if (saved === 'missing') {
      return c.json(apiError('announcement_missing', 'Ese anuncio no existe.'), 404);
    }
    return c.json(withStatus(saved) satisfies AdminAnnouncement);
  });

  return routes;
}
