// Tests for GET /api/admin/errors: the browsers' errors of the last 7 or 30 days, only for an administrator.
import { describe, expect, it } from 'vitest';
import { ClientErrorsReport } from '@qv/schema';
import { memoryClientErrors } from '../../../adapters/memory/clientErrors';
import { ADMIN, STUDENT, appWith, get } from '../../../test/usageApp';

const point = {
  kind: 'boot' as const,
  page: '/home',
  message: 'La página quedó en blanco',
  version: 'v1',
  stack: '',
  viewport: '',
  os: 'iOS 18',
  browser: 'Safari 18',
  phone: true,
  account: null,
};

describe('GET /api/admin/errors', () => {
  it('gives the groups of the period, 30 days unless 7 are asked for', async () => {
    let ms = Date.parse('2026-11-27T12:00:00Z');
    const errors = memoryClientErrors({ now: () => ms });
    errors.record(point);
    ms += 10 * 86_400_000;
    const { app } = appWith({ clientErrorsReader: errors });
    const all = await get(app, '/api/admin/errors', ADMIN);
    expect(all.headers.get('Cache-Control')).toBe('no-store');
    expect(ClientErrorsReport.parse(await all.json())).toMatchObject({
      days: 30,
      more: false,
      groups: [{ kind: 'boot', count: 1, os: 'iOS 18' }],
    });
    const week = ClientErrorsReport.parse(
      await (await get(app, '/api/admin/errors?days=7', ADMIN)).json(),
    );
    expect(week).toEqual({ days: 7, groups: [], more: false });
  });

  it('another period is a 400', async () => {
    const { app } = appWith({ clientErrorsReader: memoryClientErrors() });
    const r = await get(app, '/api/admin/errors?days=90', ADMIN);
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ error: 'invalid_period' });
  });

  it('a failing reader is a 503; without a reader, the route does not exist', async () => {
    const failing = appWith({
      clientErrorsReader: {
        read: async () => {
          throw new Error('Analytics Engine caído');
        },
      },
    }).app;
    const r = await get(failing, '/api/admin/errors', ADMIN);
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ error: 'errors_unavailable' });
    expect((await get(appWith().app, '/api/admin/errors', ADMIN)).status).toBe(404);
  });

  it('a student gets «no existe» and an anonymous visitor a 401, never an error', async () => {
    const { app } = appWith({ clientErrorsReader: memoryClientErrors() });
    expect((await get(app, '/api/admin/errors', STUDENT)).status).toBe(404);
    expect((await get(app, '/api/admin/errors', null)).status).toBe(401);
  });
});
