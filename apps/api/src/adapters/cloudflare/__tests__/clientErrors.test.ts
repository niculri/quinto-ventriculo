// Tests for the browsers' errors as Analytics Engine points, and for reading them back with its SQL API.
import { describe, expect, it } from 'vitest';
import type { ClientErrorPoint } from '../../../ports/clientErrors';
import {
  analyticsEngineErrorRecorder,
  analyticsEngineErrorsReader,
  clientErrorPoint,
} from '../clientErrors';

const POINT: ClientErrorPoint = {
  kind: 'chunk',
  page: '/semesters/2/courses/anatomia-2',
  message: 'No cargó /assets/index.ABC123.js',
  version: 'ABC123',
  stack: 'at x (/assets/a.js:1:2)',
  viewport: '390x844',
  os: 'iOS 18',
  browser: 'Safari 18',
  phone: true,
  account: null,
};
const A = '00000000-0000-4000-8000-00000000000a';

const ROW = {
  kind: 'chunk',
  page: POINT.page,
  message: POINT.message,
  version: 'ABC123',
  n: '3',
  first: '2026-11-18 10:00:00',
  latest: '2026-11-19 12:00:00',
  os: 'iOS 18',
  browser: 'Safari 18',
  viewport: '390x844',
  phone: '1',
  stack: 'at x',
  systems: ['iOS 18', ''],
  browsers: ['Safari 18'],
  anonymous: '1',
  accountsAndEmpty: '2',
  accounts: ['', A],
};

const reading = (rows: unknown[], asked: string[] = []) =>
  analyticsEngineErrorsReader({
    accountId: 'cuenta',
    token: 'token',
    fetch: async (_url, init) => {
      asked.push(typeof init?.body === 'string' ? init.body : '');
      return Response.json({ data: rows });
    },
  });

describe('the points of the browsers’ errors', () => {
  it('blobs in their order: what, where, which deploy, system, browser, window, phone, stack and account', () => {
    expect(
      clientErrorPoint({ ...POINT, message: 'de ana@ug.uchile.cl', account: A }).blobs,
    ).toEqual([
      'error',
      POINT.page,
      'chunk',
      'de (correo)',
      'ABC123',
      'iOS 18',
      'Safari 18',
      '390x844',
      '1',
      'at x (/assets/a.js:1:2)',
      A,
    ]);
    const unknown = clientErrorPoint({ ...POINT, phone: null }).blobs;
    expect([unknown[8], unknown[10]]).toEqual(['', '']);
    expect(clientErrorPoint({ ...POINT, phone: false }).blobs[8]).toBe('0');
    expect(clientErrorPoint(POINT)).toMatchObject({ indexes: ['error'], doubles: [1] });
  });

  it('a failure of writeDataPoint is swallowed', () => {
    const recorder = analyticsEngineErrorRecorder({
      writeDataPoint: () => {
        throw new Error('Analytics Engine caído');
      },
    });
    expect(() => recorder.record(POINT)).not.toThrow();
  });
});

describe('analyticsEngineErrorsReader', () => {
  it('asks only for the error points of the period, and reads each group', async () => {
    const asked: string[] = [];
    expect(await reading([ROW, { ...ROW, kind: 'otro' }], asked).read(30)).toEqual([
      {
        kind: 'chunk',
        page: POINT.page,
        message: POINT.message,
        version: 'ABC123',
        count: 3,
        firstSeen: '2026-11-18T10:00:00Z',
        lastSeen: '2026-11-19T12:00:00Z',
        os: 'iOS 18',
        browser: 'Safari 18',
        viewport: '390x844',
        phone: true,
        stack: 'at x',
        systems: ['iOS 18'],
        browsers: ['Safari 18'],
        anonymous: 1,
        people: 1,
        accounts: [A],
      },
    ]);
    expect(asked[0]).toContain("blob1 = 'error'");
    expect(asked[0]).toContain("INTERVAL '30' DAY");
    expect(asked[0]).toContain(
      'GROUP BY kind, page, message, version ORDER BY latest DESC LIMIT 101',
    );
    expect(asked[0]).toContain('argMax(blob10, timestamp) AS stack');
    expect(asked[0]).toContain('topK(11)(blob11) AS accounts');
  });

  it('an older point, without the newer blobs, reads with them empty', async () => {
    const [g] = await reading([
      {
        ...ROW,
        os: '',
        browser: '',
        viewport: '',
        phone: '',
        stack: '',
        systems: [''],
        browsers: [''],
        anonymous: 3,
        accountsAndEmpty: 1,
        accounts: [''],
      },
    ]).read(7);
    expect(g).toMatchObject({
      os: '',
      phone: null,
      systems: [],
      anonymous: 3,
      people: 0,
      accounts: [],
    });
    const [old] = await reading([{ ...ROW, phone: '0', systems: null, anonymous: 0 }]).read(7);
    expect(old).toMatchObject({ phone: false, systems: [], people: 2 });
  });

  it('a group whose last error has no readable time is dropped, not shown without a date', async () => {
    expect(await reading([{ ...ROW, latest: null }]).read(7)).toEqual([]);
  });
});
