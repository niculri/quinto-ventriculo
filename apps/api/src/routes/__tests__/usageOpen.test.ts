// Tests for POST /api/usage/open: what a page says it opened writes one anonymous point, and nothing else does.
import { describe, expect, it } from 'vitest';
import { analyticsEngineRecorder, usagePoint } from '../../adapters/cloudflare/analyticsEngine';
import { memoryUsageEvents } from '../../adapters/memory/usageEvents';
import type { UsageEvent } from '../../ports/usage';
import {
  ADMIN,
  GETS,
  OPENS,
  SECRET_QUERY,
  STUDENT,
  STUDENT_ID,
  appWith,
  content,
  get,
  open,
} from '../../test/usageApp';

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
    const recorder: { record(event: UsageEvent): unknown } = analyticsEngineRecorder({
      writeDataPoint: (p) => {
        points.push(p);
      },
    });
    expect(
      recorder.record({ kind: 'search', path: '/api/search', context: 'home' }),
    ).toBeUndefined();
    expect(points).toEqual([
      { indexes: ['search'], blobs: ['search', '/api/search', 'home'], doubles: [1] },
    ]);
  });
});
