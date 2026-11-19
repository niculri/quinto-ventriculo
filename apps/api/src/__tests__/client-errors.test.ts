// Tests for the browsers' error reports: what is kept of each one, what is refused, and how they come back grouped.
import { describe, expect, it } from 'vitest';
import type { ClientErrorReport } from '@qv/schema';
import { createApp } from '../app';
import type { Dependencies } from '../app';
import {
  analyticsEngineErrorRecorder,
  analyticsEngineErrorsReader,
  clientErrorPoint,
  errorBudget,
  memoryClientErrors,
  scrubErrorMessage,
} from '../client-errors';
import { MediaSigner } from '../media';
import { memoryRepository } from '../repositories/memory';

const SITE = 'https://sitio.test';

const REPORT: ClientErrorReport = {
  kind: 'chunk',
  page: '/semesters/2/courses/anatomia-2',
  message: 'No cargó /assets/index.ABC123.js',
  version: 'ABC123',
};

const EMPTY = {
  semesters: [],
  courses: [],
  assessments: [],
  notes: [],
  ankiNoteTypes: [],
  ankiPresets: [],
  ankiDecks: [],
  ankiNotes: [],
  quizzes: [],
};

function appWith(deps: Partial<Dependencies> = {}, nowSeconds = () => 1_800_000_000) {
  return createApp({
    verifier: { verify: async () => null },
    repository: memoryRepository(EMPTY),
    media: { get: async () => null },
    signer: new MediaSigner('secreto-de-prueba-0123456789-0123456789'),
    now: nowSeconds,
    ...deps,
  });
}

const send = (
  app: ReturnType<typeof createApp>,
  body: unknown,
  headers: Record<string, string> = { Origin: SITE },
) =>
  app.request(`${SITE}/api/client-error`, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'text/plain;charset=UTF-8', ...headers },
  });

describe('what is kept of a report', () => {
  it('takes out emails and long runs of letters and digits, and cuts at 300 characters', () => {
    expect(scrubErrorMessage('falló para ana.prueba@ug.uchile.cl')).toBe('falló para (correo)');
    expect(scrubErrorMessage('token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 vencido')).toBe(
      'token … vencido',
    );
    expect(scrubErrorMessage('x'.repeat(10) + ' ' + 'y'.repeat(400))).toBe('xxxxxxxxxx …');
    expect(scrubErrorMessage('a '.repeat(200))).toHaveLength(300);
  });

  it('is a point with the path, the kind, the scrubbed message and the version, never who', () => {
    expect(clientErrorPoint({ ...REPORT, message: 'de ana@ug.uchile.cl' })).toEqual({
      indexes: ['error'],
      blobs: ['error', REPORT.page, 'chunk', 'de (correo)', 'ABC123'],
      doubles: [1],
    });
  });

  it('a failure of writeDataPoint is swallowed', () => {
    const recorder = analyticsEngineErrorRecorder({
      writeDataPoint: () => {
        throw new Error('Analytics Engine caído');
      },
    });
    expect(() => recorder.record(REPORT)).not.toThrow();
  });
});

describe('POST /api/client-error', () => {
  it('keeps a well-formed report from the site, without a session, and answers 204', async () => {
    const errors = memoryClientErrors();
    const r = await send(appWith({ clientErrors: errors }), REPORT);
    expect(r.status).toBe(204);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(errors.points).toMatchObject([REPORT]);
  });

  it('a report without Origin (an old sendBeacon) is kept too', async () => {
    const errors = memoryClientErrors();
    expect((await send(appWith({ clientErrors: errors }), REPORT, {})).status).toBe(204);
    expect(errors.points).toHaveLength(1);
  });

  it('refuses another origin with 403 and keeps nothing', async () => {
    const errors = memoryClientErrors();
    const r = await send(appWith({ clientErrors: errors }), REPORT, {
      Origin: 'https://otro.test',
    });
    expect(r.status).toBe(403);
    expect(errors.points).toEqual([]);
  });

  it.each([
    ['not JSON', 'esto no es json'],
    ['an unknown kind', { ...REPORT, kind: 'otro' }],
    ['a page with its query', { ...REPORT, page: '/search?q=secreto' }],
    ['a page that is not a path', { ...REPORT, page: 'https://otro.test/' }],
    ['an extra field', { ...REPORT, email: 'ana@ug.uchile.cl' }],
    ['a version with odd characters', { ...REPORT, version: '../x' }],
    ['more than 1 KB', { ...REPORT, message: 'x'.repeat(1100) }],
  ])('refuses %s with 400', async (_what, body) => {
    const errors = memoryClientErrors();
    const r = await send(appWith({ clientErrors: errors }), body);
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ error: 'invalid_client_error' });
    expect(errors.points).toEqual([]);
  });

  it('without a recorder it answers the same and keeps nothing', async () => {
    expect((await send(appWith(), REPORT)).status).toBe(204);
  });

  it('keeps at most 60 a minute, and starts again the next minute', async () => {
    const errors = memoryClientErrors();
    let seconds = 1_800_000_000;
    const app = appWith({ clientErrors: errors }, () => seconds);
    for (let i = 0; i < 61; i++) expect((await send(app, REPORT)).status).toBe(204);
    expect(errors.points).toHaveLength(60);
    seconds += 60;
    await send(app, REPORT);
    expect(errors.points).toHaveLength(61);
  });
});

describe('the budget', () => {
  it('counts per minute of the clock', () => {
    let ms = 120_000;
    const take = errorBudget(2, () => ms);
    expect([take(), take(), take()]).toEqual([true, true, false]);
    ms += 59_999;
    expect(take()).toBe(false);
    ms += 1;
    expect(take()).toBe(true);
  });
});

describe('reading them back', () => {
  it('groups by kind, page, message and version, newest first, only the last 7 days', async () => {
    let ms = Date.parse('2026-11-19T12:00:00Z');
    const errors = memoryClientErrors({ now: () => ms });
    errors.record(REPORT);
    ms += 60_000;
    errors.record({ ...REPORT, kind: 'boot', message: 'La página quedó en blanco' });
    ms += 60_000;
    errors.record(REPORT);
    expect(await errors.read()).toEqual([
      { ...REPORT, count: 2, lastSeen: '2026-11-19T12:02:00.000Z' },
      {
        ...REPORT,
        kind: 'boot',
        message: 'La página quedó en blanco',
        count: 1,
        lastSeen: '2026-11-19T12:01:00.000Z',
      },
    ]);
    ms += 7 * 86_400_000;
    expect(await errors.read()).toEqual([]);
  });

  it('Analytics Engine: asks only for the error points and drops rows it cannot read', async () => {
    const asked: string[] = [];
    const reader = analyticsEngineErrorsReader({
      accountId: 'cuenta',
      token: 'token',
      fetch: async (_url, init) => {
        asked.push(String(init?.body));
        return Response.json({
          data: [
            { ...REPORT, n: '3', last: '2026-11-19 12:00:00' },
            {
              kind: 'otro',
              page: '/',
              message: '',
              version: '',
              n: 1,
              last: '2026-11-19 11:00:00',
            },
          ],
        });
      },
    });
    expect(await reader.read()).toEqual([
      { ...REPORT, count: 3, lastSeen: '2026-11-19T12:00:00Z' },
    ]);
    expect(asked[0]).toContain("blob1 = 'error'");
    expect(asked[0]).toContain("INTERVAL '7' DAY");
  });
});
