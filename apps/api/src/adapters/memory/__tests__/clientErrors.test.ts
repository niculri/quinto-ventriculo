// Tests for the browsers' errors kept in memory: grouped like the SQL of the Analytics Engine reader.
import { describe, expect, it } from 'vitest';
import { ERRORS_SHOWN } from '@qv/schema';
import type { ClientErrorPoint } from '../../../ports/clientErrors';
import { memoryClientErrors } from '../clientErrors';

const POINT: ClientErrorPoint = {
  kind: 'chunk',
  page: '/semesters/2/courses/anatomia-2',
  message: 'No cargó /assets/index.ABC123.js',
  version: 'ABC123',
  stack: '',
  viewport: '390x844',
  os: 'iOS 18',
  browser: 'Safari 18',
  phone: true,
  account: null,
};
const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';

describe('memoryClientErrors', () => {
  it('groups by kind, page, message and version, newest first, only in the period', async () => {
    let ms = Date.parse('2026-11-19T12:00:00Z');
    const errors = memoryClientErrors({ now: () => ms });
    errors.record(POINT);
    ms += 60_000;
    errors.record({ ...POINT, kind: 'boot', message: 'La página quedó en blanco' });
    ms += 60_000;
    errors.record({
      ...POINT,
      os: 'Android 14',
      browser: 'Chrome 131',
      viewport: '412x915',
      stack: 'at x',
    });
    const [chunk, boot] = await errors.read(7);
    expect(chunk).toEqual({
      kind: 'chunk',
      page: POINT.page,
      message: POINT.message,
      version: 'ABC123',
      count: 2,
      firstSeen: '2026-11-19T12:00:00.000Z',
      lastSeen: '2026-11-19T12:02:00.000Z',
      os: 'Android 14',
      browser: 'Chrome 131',
      viewport: '412x915',
      phone: true,
      stack: 'at x',
      systems: ['iOS 18', 'Android 14'],
      browsers: ['Safari 18', 'Chrome 131'],
      anonymous: 2,
      people: 0,
      accounts: [],
    });
    expect(boot).toMatchObject({ kind: 'boot', count: 1 });
    ms += 7 * 86_400_000;
    expect(await errors.read(7)).toEqual([]);
    expect(await errors.read(30)).toHaveLength(2);
  });

  it('counts the distinct accounts, most frequent first, apart from the times without one', async () => {
    let ms = Date.parse('2026-11-19T12:00:00Z');
    const errors = memoryClientErrors({ now: () => ms });
    for (const account of [A, B, B, null]) {
      ms += 1000;
      errors.record({ ...POINT, account });
    }
    expect(await errors.read(30)).toMatchObject([
      { count: 4, anonymous: 1, people: 2, accounts: [B, A] },
    ]);
  });

  it('a point that arrives with an older clock does not move the last seen back', async () => {
    let ms = Date.parse('2026-11-19T12:00:00Z');
    const errors = memoryClientErrors({ now: () => ms });
    errors.record(POINT);
    ms -= 60_000;
    errors.record({ ...POINT, os: '' });
    expect(await errors.read(30)).toMatchObject([
      {
        count: 2,
        os: 'iOS 18',
        firstSeen: '2026-11-19T11:59:00.000Z',
        lastSeen: '2026-11-19T12:00:00.000Z',
      },
    ]);
  });

  it('the message and the stack are scrubbed, and it starts with the points it is given', async () => {
    const now = Date.parse('2026-11-19T12:00:00Z');
    const errors = memoryClientErrors({ now: () => now, start: [{ ...POINT, at: now - 1000 }] });
    errors.record({ ...POINT, message: 'de alguien@ug.uchile.cl', stack: `${'x'.repeat(30)}\nb` });
    expect(errors.points.at(-1)).toMatchObject({ message: 'de (correo)', stack: '…\nb' });
    expect(await errors.read(30)).toHaveLength(2);
  });

  it(`only the ${String(ERRORS_SHOWN + 1)} groups seen last come back`, async () => {
    let ms = Date.parse('2026-11-19T12:00:00Z');
    const errors = memoryClientErrors({ now: () => ms });
    for (let i = 0; i < ERRORS_SHOWN + 5; i++) {
      ms += 1000;
      errors.record({ ...POINT, page: `/p${String(i)}` });
    }
    const shown = await errors.read(30);
    expect(shown).toHaveLength(ERRORS_SHOWN + 1);
    expect(shown[0]!.page).toBe(`/p${String(ERRORS_SHOWN + 4)}`);
  });
});
