// Tests for the browsers' errors kept in memory: grouped like the SQL of the Analytics Engine reader.
import { describe, expect, it } from 'vitest';
import type { ClientErrorReport } from '@qv/schema';
import { memoryClientErrors } from '../clientErrors';

const REPORT: ClientErrorReport = {
  kind: 'chunk',
  page: '/semesters/2/courses/anatomia-2',
  message: 'No cargó /assets/index.ABC123.js',
  version: 'ABC123',
};

describe('memoryClientErrors', () => {
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
});
