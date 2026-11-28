// Tests for POST /api/client-error: what is kept of a report, what is refused and how many a minute are taken.
import { describe, expect, it } from 'vitest';
import type { ClientErrorReport } from '@qv/schema';
import { memoryClientErrors } from '../../adapters/memory/clientErrors';
import { memoryRepository } from '../../adapters/memory/content';
import { createApp } from '../../app';
import type { AppOptions } from '../../dependencies';
import { MediaSigner } from '../../services/mediaSigner';

const SITE = 'https://sitio.test';

const REPORT: ClientErrorReport = {
  kind: 'chunk',
  page: '/semesters/2/courses/anatomia-2',
  message: 'No cargó /assets/index.ABC123.js',
  version: 'ABC123',
  stack: '',
  viewport: '390x844',
};
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';

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

function appWith(deps: Partial<AppOptions> = {}, nowSeconds = () => 1_800_000_000) {
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

describe('POST /api/client-error', () => {
  it('keeps a well-formed report from the site, without a session, with the system and browser of its User-Agent', async () => {
    const errors = memoryClientErrors();
    const r = await send(appWith({ clientErrors: errors }), REPORT, {
      Origin: SITE,
      'User-Agent': IPHONE,
    });
    expect(r.status).toBe(204);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(errors.points).toMatchObject([
      { ...REPORT, os: 'iOS 18', browser: 'Safari 18', phone: true, account: null },
    ]);
    expect(Object.values(errors.points[0]!)).not.toContain(IPHONE);
  });

  it('an older page, without stack nor window, counts too', async () => {
    const errors = memoryClientErrors();
    const { stack: _s, viewport: _v, ...old } = REPORT;
    expect((await send(appWith({ clientErrors: errors }), old)).status).toBe(204);
    expect(errors.points).toMatchObject([{ ...old, stack: '', viewport: '', os: '', phone: null }]);
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
    ['more than 2.5 KB', { ...REPORT, stack: 'x'.repeat(2600) }],
    ['a stack of more than 1,500', { ...REPORT, stack: 'x'.repeat(1501) }],
    ['a window that is not a size', { ...REPORT, viewport: 'grande' }],
  ])('refuses %s with 400', async (_what, body) => {
    const errors = memoryClientErrors();
    const r = await send(appWith({ clientErrors: errors }), body);
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ error: 'invalid_client_error' });
    expect(errors.points).toEqual([]);
  });

  it('a body that announces its size and breaks while it is read is refused with 400 and keeps nothing', async () => {
    const errors = memoryClientErrors();
    const broken = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error('conexión cortada'));
      },
    });
    const r = await appWith({ clientErrors: errors }).request(`${SITE}/api/client-error`, {
      method: 'POST',
      body: broken,
      headers: { Origin: SITE, 'Content-Length': '40' },
      duplex: 'half',
    } as RequestInit);
    expect(r.status).toBe(400);
    expect(errors.points).toEqual([]);
  });

  it('takes 2,560 units of JSON, 300 of message and 1,500 of stack, not one more', async () => {
    const json = JSON.stringify(REPORT);
    const padded = (units: number) => json + ' '.repeat(units - json.length);
    const errors = memoryClientErrors();
    const app = appWith({ clientErrors: errors });
    expect((await send(app, padded(2560))).status).toBe(204);
    expect((await send(app, padded(2561))).status).toBe(400);
    expect((await send(app, { ...REPORT, stack: 'x'.repeat(1500) })).status).toBe(204);
    expect((await send(app, { ...REPORT, message: 'x'.repeat(300) })).status).toBe(204);
    expect((await send(app, { ...REPORT, message: 'x'.repeat(301) })).status).toBe(400);
    expect(errors.points).toHaveLength(3);
  });

  it('a body above 7.5 KB is refused with 413 after reading little of it', async () => {
    const errors = memoryClientErrors();
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(1024));
        if (pulled > 10_000) controller.close();
      },
    });
    const r = await appWith({ clientErrors: errors }).request(`${SITE}/api/client-error`, {
      method: 'POST',
      body,
      headers: { Origin: SITE },
      duplex: 'half',
    } as RequestInit);
    expect(r.status).toBe(413);
    expect(pulled).toBeLessThanOrEqual(10);
    expect(errors.points).toEqual([]);
  });

  it('a Content-Length above 7.5 KB is refused with 413 without looking at the body', async () => {
    const errors = memoryClientErrors();
    const r = await send(appWith({ clientErrors: errors }), JSON.stringify(REPORT), {
      Origin: SITE,
      'Content-Length': '100000',
    });
    expect(r.status).toBe(413);
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
