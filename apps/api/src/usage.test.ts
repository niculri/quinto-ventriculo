// Step 2.9: «Uso» in the administration panel. Opening a note, a deck or a test, and completing a search, writes an anonymous
// point (never who, their email, IP, country or browser, nor what was searched) that never changes the answer; only an
// administrator reads the figures; without the Analytics Engine secret the page has the database's figures and says
// that the opens are not configured.
import { describe, expect, it } from 'vitest';
import { FEW, UsageReport } from '@qv/schema';
import type { AdminUsageRow, Catalog, Note, QuizDetail } from '@qv/schema';
import { createApp } from './app';
import type { Dependencies } from './app';
import { MediaSigner } from './media';
import type { ContentRepository } from './repository';
import {
  analyticsEngineReader,
  analyticsEngineRecorder,
  memoryUsageEvents,
  opensFigures,
  siteDay,
  usageGroups,
  usagePoint,
} from './usage';
import type { UsageGroups, UsageStatsSource } from './usage';

const ADMIN = 'dueno@ug.uchile.cl';
const STUDENT = 'ana.prueba@ug.uchile.cl';
const STUDENT_ID = '00000000-0000-4000-8000-0000000000a1';
const SECRET_QUERY = 'mitocondria secreta';

const deck = (id: string, name: string, parentId: string | null, a: string | null) => ({
  id,
  name,
  parentId,
  preset: null,
  semester: name.split('::').length > 1 ? 2 : null,
  courseId: name.split('::').length > 2 ? 'ramo' : null,
  assessmentId: a,
  noteCount: 1,
  cardCount: 1,
});
const ROOT = '() Medicina UCH';
const CATALOG = {
  semesters: [
    {
      number: 2,
      name: 'Segundo semestre',
      courses: [
        {
          id: 'ramo',
          semester: 2,
          name: 'Ramo de prueba',
          emoji: '🧪',
          position: 1,
          assessments: [
            {
              id: 'ramo/certamen-1',
              courseId: 'ramo',
              name: 'Certamen 1',
              position: 1,
              notes: [{ id: 'n1', slug: 'apunte', title: 'Apunte' }],
              cardCount: 3,
              quizzes: [
                {
                  id: 'test-de-prueba',
                  slug: 'practica',
                  courseId: 'ramo',
                  assessmentId: 'ramo/certamen-1',
                  title: 'Test de prueba',
                  position: 1,
                  questionCount: 3,
                  sectionCount: 1,
                  updatedAt: '2026-11-01T12:00:00.000Z',
                },
              ],
            },
          ],
        },
      ],
    },
  ],
  anki: {
    decks: [
      deck('1', ROOT, null, null),
      deck('2', `${ROOT}::2° Semestre`, '1', null),
      deck('3', `${ROOT}::2° Semestre::Ramo`, '2', null),
      deck('4', `${ROOT}::2° Semestre::Ramo::Certamen 1`, '3', 'ramo/certamen-1'),
      deck('5', `${ROOT}::2° Semestre::Ramo::Certamen 1::01 - Clase`, '4', 'ramo/certamen-1'),
      deck(
        '6',
        `${ROOT}::2° Semestre::Ramo::Certamen 1::01 - Clase::Extras`,
        '5',
        'ramo/certamen-1',
      ),
    ],
    presets: [],
    noteTypes: [],
  },
} as unknown as Catalog;

/** The published content, only what these routes read. */
const content = (): ContentRepository =>
  ({
    catalog: async () => CATALOG,
    note: async (slug: string) =>
      slug === 'apunte'
        ? ({ slug, title: 'Apunte', html: '<p>Hola</p>' } as unknown as Note)
        : null,
    deckJson: async (id: string) => (id === '5' ? '{"id":"5"}' : null),
    quiz: async (id: string) =>
      id === 'test-de-prueba' ? ({ id, title: 'Test' } as unknown as QuizDetail) : null,
    search: async () => [],
  }) as unknown as ContentRepository;

/** What admin_usage() would answer: today 6 students. */
function row(groups?: UsageGroups): AdminUsageRow {
  const today = siteDay(Date.now());
  const f = (active: number | typeof FEW) => ({
    active_students: active,
    new_students: 0,
    anki_answers: active === FEW ? FEW : 120,
    new_cards: FEW,
    rounds_started: 6,
    rounds_finished: 5,
  });
  const day = (back: number) => siteDay(Date.now() - back * 86_400_000);
  return {
    generated_at: new Date().toISOString(),
    today,
    time_zone: 'America/Santiago',
    min_students: 5,
    totals: { today: f(6), last_7: f(8), last_30: f(9) },
    days: Array.from({ length: 30 }, (_, i) => ({ day: day(29 - i), ...f(i === 29 ? 6 : FEW) })),
    weeks: Array.from({ length: 12 }, (_, i) => ({ week: day(7 * (11 - i)), ...f(FEW) })),
    decks: groups ? [{ deck_id: '5', students: 6, answers: 120, new_cards: FEW }] : [],
    quizzes: [],
    courses: [],
    assessments: [],
    invited: { signed_in: 7, never: FEW },
    activation: { eligible: 6, activated: 6, not_activated: 0, percent: 100 },
  };
}

function appWith(deps: Partial<Dependencies> = {}) {
  const asked: { token: string; groups: UsageGroups }[] = [];
  const stats: UsageStatsSource = {
    stats: async (token, groups) => {
      asked.push({ token, groups });
      return row(groups);
    },
  };
  const preview = content();
  const app = createApp({
    verifier: {
      verify: async (token) => ({ id: token === STUDENT ? STUDENT_ID : token, email: token }),
    },
    repository: content(),
    preview,
    media: { get: async () => null },
    signer: new MediaSigner('secreto-de-prueba-0123456789-0123456789'),
    admins: { isAdmin: async (token) => token === ADMIN },
    usageStats: stats,
    ...deps,
  });
  return { app, asked };
}

const get = (app: ReturnType<typeof createApp>, path: string, who: string | null, h = {}) =>
  app.request(path, {
    headers: {
      ...(who ? { Authorization: `Bearer ${who}` } : {}),
      'CF-Connecting-IP': '203.0.113.7',
      'CF-IPCountry': 'CL',
      'User-Agent': 'Navegador de prueba/1.0',
      ...h,
    },
  });

/** What the pages send when they open (and a completed search). */
const open = (
  app: ReturnType<typeof createApp>,
  body: unknown,
  who: string | null = STUDENT,
  h: Record<string, string> = {},
) =>
  app.request('/api/usage/open', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: {
      ...(who ? { Authorization: `Bearer ${who}` } : {}),
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '203.0.113.7',
      'CF-IPCountry': 'CL',
      'User-Agent': 'Navegador de prueba/1.0',
      ...h,
    },
  });

const OPENS = [
  { kind: 'note', id: 'apunte' },
  { kind: 'deck', id: '5' },
  { kind: 'quiz', id: 'test-de-prueba' },
  { kind: 'search', from: 'note' },
];
const GETS = [
  '/api/notes/apunte',
  '/api/decks/5',
  '/api/quizzes/test-de-prueba',
  `/api/search?q=${encodeURIComponent(SECRET_QUERY)}`,
];

describe('the points of Analytics Engine', () => {
  it('what a page says it opened (and a completed search) writes one point each, without anything of the student', async () => {
    const events = memoryUsageEvents();
    const { app } = appWith({ usageEvents: events });
    for (const body of OPENS) {
      const r = await open(app, body);
      expect(r.status).toBe(200);
      expect(r.headers.get('Cache-Control')).toBe('no-store');
    }
    expect(events.points.map(({ at: _, ...p }) => p)).toEqual([
      { kind: 'note', path: '/api/notes/apunte' },
      { kind: 'deck', path: '/api/decks/5' },
      { kind: 'quiz', path: '/api/quizzes/test-de-prueba' },
      { kind: 'search', path: '/api/search', context: 'note' },
    ]);
    const written = JSON.stringify(events.points.map(({ at: _, ...p }) => usagePoint(p)));
    for (const x of [STUDENT, STUDENT_ID, '203.0.113.7', 'CL"', 'Navegador']) {
      expect(written).not.toContain(x);
    }
  });

  it('reading a note, a deck or a test, or searching, counts nothing: other pages ask them too', async () => {
    const events = memoryUsageEvents();
    const { app } = appWith({ usageEvents: events });
    for (const path of GETS) expect((await get(app, path, STUDENT)).status).toBe(200);
    expect(events.points).toEqual([]);
  });

  it('only with a session, only what has the shape, short, and never the preview', async () => {
    const events = memoryUsageEvents();
    const { app } = appWith({ usageEvents: events });
    expect((await open(app, OPENS[0], null)).status).toBe(401);
    for (const bad of [
      { kind: 'search', from: '<script>' },
      { kind: 'search', from: 'note', q: SECRET_QUERY },
      { kind: 'note', id: 'Con Espacios' },
      { kind: 'note', id: `a${'-b'.repeat(80)}` },
      { kind: 'deck', id: 'abc' },
      { kind: 'card', id: 'g:0' },
      { kind: 'note', id: 'apunte', user: STUDENT_ID },
      'no es json',
      JSON.stringify({ kind: 'note', id: 'apunte', relleno: 'x'.repeat(600) }),
    ]) {
      expect((await open(app, bad)).status, JSON.stringify(bad)).toBe(400);
    }
    expect((await open(app, OPENS[0], ADMIN, { 'X-QV-Preview': 'draft' })).status).toBe(200);
    expect(events.points).toEqual([]);
  });

  it('only what is published: an id with the right shape that is not (a student’s id, any text) writes nothing', async () => {
    const events = memoryUsageEvents();
    let reads = 0;
    const repository = content();
    const catalog = repository.catalog.bind(repository);
    repository.catalog = async () => {
      reads += 1;
      return catalog();
    };
    const { app } = appWith({ usageEvents: events, repository });
    for (const body of [
      { kind: 'note', id: STUDENT_ID },
      { kind: 'note', id: 'ana-prueba-estuvo-aqui' },
      { kind: 'quiz', id: 'apunte' },
      { kind: 'deck', id: '999' },
    ]) {
      expect((await open(app, body)).status, JSON.stringify(body)).toBe(404);
    }
    expect(events.points).toEqual([]);
    // The catalog is read once and kept: an open does not read it each time.
    for (const body of OPENS) expect((await open(app, body)).status).toBe(200);
    expect(events.points).toHaveLength(4);
    expect(reads).toBe(1);
  });

  it('if the catalog cannot be read, nothing is counted (and the search still is)', async () => {
    const events = memoryUsageEvents();
    const repository = content();
    repository.catalog = async () => {
      throw new Error('sin red');
    };
    const { app } = appWith({ usageEvents: events, repository });
    expect((await open(app, OPENS[0])).status).toBe(503);
    expect((await open(app, OPENS[3])).status).toBe(200);
    expect(events.points.map((p) => p.kind)).toEqual(['search']);
  });

  it('a failure of writeDataPoint does not change the answer', async () => {
    const quiet = appWith().app;
    const failing = appWith({
      usageEvents: analyticsEngineRecorder({
        writeDataPoint: () => {
          throw new Error('Analytics Engine caído');
        },
      }),
    }).app;
    for (const body of OPENS) {
      const [a, b] = await Promise.all([open(quiet, body), open(failing, body)]);
      expect(b.status).toBe(200);
      expect(await b.text()).toBe(await a.text());
    }
  });

  it('the binding gets the kind, the path and the kind of page, and is never awaited', () => {
    const points: unknown[] = [];
    const recorder = analyticsEngineRecorder({ writeDataPoint: (p) => void points.push(p) });
    expect(
      recorder.record({ kind: 'search', path: '/api/search', context: 'home' }),
    ).toBeUndefined();
    expect(points).toEqual([
      { indexes: ['search'], blobs: ['search', '/api/search', 'home'], doubles: [1] },
    ]);
  });
});

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
    expect(body.invited).toEqual({ signedIn: 7, never: FEW });
    expect(body.decks).toEqual([{ deckId: '5', students: 6, answers: 120, newCards: FEW }]);
    // Asked with the administrator's own token, and the groups from the published catalog.
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

  it('with the opens: by the site’s day, hidden where fewer than 5 students were active', async () => {
    const events = memoryUsageEvents();
    const { app } = appWith({ usageEvents: events, usageOpens: events });
    for (let i = 0; i < 6; i++) await open(app, { kind: 'note', id: 'apunte' });
    for (let i = 0; i < 3; i++) await open(app, { kind: 'deck', id: '5' });
    // Two days ago (4 students active that day in the made-up figures): hidden.
    events.points.push({
      kind: 'quiz',
      path: '/api/quizzes/test-de-prueba',
      at: Date.now() - 2 * 86_400_000,
    });
    const body = UsageReport.parse(await (await get(app, '/api/admin/usage', ADMIN)).json());
    expect(body.opensStatus).toBe('ok');
    expect(body.opens!.totals.today).toEqual({ notes: 6, decks: FEW, quizzes: 0, searches: 0 });
    expect(body.opens!.days.at(-1)).toEqual({
      day: body.today,
      notes: 6,
      decks: FEW,
      quizzes: 0,
      searches: 0,
    });
    expect(body.opens!.days.at(-3)).toEqual({
      day: body.days.at(-3)!.day,
      notes: FEW,
      decks: FEW,
      quizzes: FEW,
      searches: FEW,
    });
    // Only what was opened 5 times or more.
    expect(body.opens!.top).toEqual([{ kind: 'note', id: 'apunte', opens: 6 }]);
  });
});

describe('the pieces', () => {
  it('the SQL API: the account, the token, the dataset, and its counts as text', async () => {
    const sent: { url: string; auth: string | null; sql: string }[] = [];
    const reader = analyticsEngineReader({
      accountId: 'cuenta-de-prueba',
      token: 'token-de-prueba',
      fetch: (async (url: string, init: RequestInit) => {
        const sql = String(init.body);
        sent.push({ url, auth: new Headers(init.headers).get('Authorization'), sql });
        const data = sql.includes('toStartOfInterval')
          ? [{ hour: '2026-11-09 13:00:00', kind: 'note', n: '7' }]
          : sql.includes('blob2')
            ? [{ kind: 'note', path: '/api/notes/apunte', n: '7' }]
            : [{ context: 'home', n: 2 }];
        return new Response(JSON.stringify({ meta: [], data, rows: data.length }));
      }) as typeof fetch,
    });
    expect(await reader.read()).toEqual({
      hourly: [{ hour: '2026-11-09T13:00:00Z', kind: 'note', count: 7 }],
      items: [{ kind: 'note', path: '/api/notes/apunte', count: 7 }],
      searches: [{ context: 'home', count: 2 }],
    });
    expect(sent).toHaveLength(3);
    for (const s of sent) {
      expect(s.url).toBe(
        'https://api.cloudflare.com/client/v4/accounts/cuenta-de-prueba/analytics_engine/sql',
      );
      expect(s.auth).toBe('Bearer token-de-prueba');
      expect(s.sql).toContain('FROM qv_usage');
      expect(s.sql).toMatch(/FORMAT JSON$/);
    }
  });

  it('the site’s day starts at 4:00 in Santiago', () => {
    // 2026-11-09 06:59 UTC = 03:59 in Santiago (summer, -3): still the 8th.
    expect(siteDay(Date.parse('2026-11-09T06:59:00Z'))).toBe('2026-11-08');
    expect(siteDay(Date.parse('2026-11-09T07:00:00Z'))).toBe('2026-11-09');
  });

  it('the groups leave out what is not in a course, and a test with an id the database would refuse', () => {
    const catalog = structuredClone(CATALOG);
    catalog.semesters[0]!.courses[0]!.assessments[0]!.quizzes.push({
      ...catalog.semesters[0]!.courses[0]!.assessments[0]!.quizzes[0]!,
      id: 'Mal_Id',
    });
    expect(Object.keys(usageGroups(catalog).quizzes)).toEqual(['test-de-prueba']);
    expect(Object.keys(usageGroups(catalog).decks)).toEqual(['3', '4', '5', '6']);
  });

  it('with fewer than 5 students active in the 30 days, no list of the most opened', () => {
    const r = row();
    r.totals.last_30.active_students = FEW;
    const opens = opensFigures(
      {
        hourly: [],
        items: [{ kind: 'note', path: '/api/notes/apunte', count: 50 }],
        searches: [{ context: 'note', count: 9 }],
      },
      r,
    );
    expect(opens.top).toEqual([]);
    expect(opens.searches).toEqual([]);
  });
});
