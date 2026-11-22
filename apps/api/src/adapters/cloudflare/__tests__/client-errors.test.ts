// Tests for the browsers' errors as Analytics Engine points, and for reading them back with its SQL API.
import { describe, expect, it } from 'vitest';
import type { ClientErrorReport } from '@qv/schema';
import {
  analyticsEngineErrorRecorder,
  analyticsEngineErrorsReader,
  clientErrorPoint,
} from '../client-errors';

const REPORT: ClientErrorReport = {
  kind: 'chunk',
  page: '/semesters/2/courses/anatomia-2',
  message: 'No cargó /assets/index.ABC123.js',
  version: 'ABC123',
};

describe('the points of the browsers’ errors', () => {
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

describe('analyticsEngineErrorsReader', () => {
  it('Analytics Engine: asks only for the error points and drops rows it cannot read', async () => {
    const asked: string[] = [];
    const reader = analyticsEngineErrorsReader({
      accountId: 'cuenta',
      token: 'token',
      fetch: async (_url, init) => {
        asked.push(typeof init?.body === 'string' ? init.body : '');
        return Response.json({
          data: [
            { ...REPORT, n: '3', latest: '2026-11-19 12:00:00' },
            {
              kind: 'otro',
              page: '/',
              message: '',
              version: '',
              n: 1,
              latest: '2026-11-19 11:00:00',
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
    expect(asked[0]).toContain(
      'GROUP BY kind, page, message, version ORDER BY latest DESC LIMIT 50',
    );
    expect(asked[0]).toContain('SUM(_sample_interval) AS n');
  });
});
