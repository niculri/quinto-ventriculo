// `GET /api/me`: the student a session belongs to.
import { Hono } from 'hono';
import { API_ROUTES as R } from '@qv/schema/http';
import type { AppContext } from '../context';
import type { AppEnv } from '../env';
import type { User } from '../ports/session';

export function meRoutes({ mw }: AppContext) {
  return new Hono<AppEnv>().get(R.me.pattern, mw.session, (c) =>
    c.json(c.get('user') satisfies User),
  );
}
