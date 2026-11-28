// Tests for GET /api/admin/usage: the figures only an administrator reads.
import { describe, expect, it } from 'vitest';
import { UsageReport } from '@qv/schema';
import { memoryUsageEvents } from '../../../adapters/memory/usageEvents';
import { ADMIN, STUDENT, appWith, get, open, row } from '../../../test/usageApp';

describe('GET /api/admin/usage', () => {
  it('a student and an anonymous visitor get «no existe», never a figure', async () => {
    const { app, asked } = appWith();
    const r = await get(app, '/api/admin/usage', STUDENT);
    expect(r.status).toBe(404);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect((await get(app, '/api/admin/usage', null)).status).toBe(401);
    expect(asked).toEqual([]);
  });

  it('without the secret: the database figures and «not configured»', async () => {
    const { app, asked } = appWith();
    const r = await get(app, '/api/admin/usage', ADMIN);
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    const body = UsageReport.parse(await r.json());
    expect(body.opensStatus).toBe('not_configured');
    expect(body.opens).toBeNull();
    expect(body.totals.today.activeStudents).toBe(6);
    expect(body.invited).toEqual({ signedIn: 7, never: 2 });
    expect(body.decks).toEqual([{ deckId: '5', students: 6, answers: 120, newCards: 4 }]);
    expect(asked).toHaveLength(1);
    expect(asked[0]!.token).toBe(ADMIN);
    expect(asked[0]!.groups).toEqual({
      decks: {
        '3': [null, null, 'ramo'],
        '4': [null, 'ramo/certamen-1', 'ramo'],
        '5': ['5', 'ramo/certamen-1', 'ramo'],
        '6': ['5', 'ramo/certamen-1', 'ramo'],
      },
      quizzes: { 'test-de-prueba': ['ramo/certamen-1', 'ramo'] },
    });
  });

  it('kept a minute: the database is not asked again', async () => {
    let t = 1_800_000_000;
    const { app, asked } = appWith({ now: () => t });
    await get(app, '/api/admin/usage', ADMIN);
    await get(app, '/api/admin/usage', ADMIN);
    expect(asked).toHaveLength(1);
    t += 61;
    await get(app, '/api/admin/usage', ADMIN);
    expect(asked).toHaveLength(2);
  });

  it('the opens that cannot be read: the database figures and «unavailable»', async () => {
    const { app } = appWith({
      usageOpens: {
        read: async () => {
          throw new Error('sin red');
        },
      },
    });
    const body = UsageReport.parse(await (await get(app, '/api/admin/usage', ADMIN)).json());
    expect(body.opensStatus).toBe('unavailable');
    expect(body.opens).toBeNull();
    expect(body.totals.last30.activeStudents).toBe(9);
  });

  it('a database that refuses: 503, and nothing kept', async () => {
    let fail = true;
    const { app } = appWith({
      usageStats: {
        stats: async () => {
          if (fail) throw new Error('admin_usage: 403');
          return row();
        },
      },
    });
    expect((await get(app, '/api/admin/usage', ADMIN)).status).toBe(503);
    fail = false;
    expect((await get(app, '/api/admin/usage', ADMIN)).status).toBe(200);
  });

  it('with the opens: by the site’s day, all exact', async () => {
    const events = memoryUsageEvents();
    const { app } = appWith({ usageEvents: events, usageOpens: events });
    for (let i = 0; i < 6; i++) await open(app, { kind: 'note', id: 'apunte' });
    for (let i = 0; i < 3; i++) await open(app, { kind: 'deck', id: '5' });
    events.points.push({
      kind: 'quiz',
      path: '/api/quizzes/test-de-prueba',
      at: Date.now() - 2 * 86_400_000,
    });
    const body = UsageReport.parse(await (await get(app, '/api/admin/usage', ADMIN)).json());
    expect(body.opensStatus).toBe('ok');
    expect(body.opens!.totals.today).toEqual({ notes: 6, decks: 3, quizzes: 0, searches: 0 });
    expect(body.opens!.days.at(-1)).toEqual({
      day: body.today,
      notes: 6,
      decks: 3,
      quizzes: 0,
      searches: 0,
    });
    expect(body.opens!.days.at(-3)).toEqual({
      day: body.days.at(-3)!.day,
      notes: 0,
      decks: 0,
      quizzes: 1,
      searches: 0,
    });
    expect(body.opens!.top).toEqual([
      { kind: 'note', id: 'apunte', opens: 6 },
      { kind: 'deck', id: '5', opens: 3 },
      { kind: 'quiz', id: 'test-de-prueba', opens: 1 },
    ]);
  });
});
