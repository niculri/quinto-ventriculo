// The SQL helpers of the users database that no test named: the day of the site and the rows a page behind repairs.
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../pglite';
import { queriesOn } from '../helpers/queries';

let db: PGlite;
const { q } = queriesOn(() => db);
const startOf = async (day: string) =>
  (await q<{ t: Date }>('select site_day_start($1::date) as t', [day]))[0]!.t.toISOString();

beforeAll(async () => {
  db = await createDatabase('users');
});

describe('site_day_start', () => {
  it('a day starts at 4:00 in Santiago: 7:00 UTC in the summer time and 8:00 UTC in the winter one', async () => {
    expect(await startOf('2026-01-15')).toBe('2026-01-15T07:00:00.000Z');
    expect(await startOf('2026-07-15')).toBe('2026-07-15T08:00:00.000Z');
  });

  it('around a clock change each day takes the offset that holds at its own 4:00', async () => {
    // Chile moves its clocks at midnight, between Saturday and Sunday: back on 4-5 April, forward on 5-6 September.
    expect(await startOf('2026-04-04')).toBe('2026-04-04T07:00:00.000Z');
    expect(await startOf('2026-04-05')).toBe('2026-04-05T08:00:00.000Z');
    expect(await startOf('2026-09-05')).toBe('2026-09-05T08:00:00.000Z');
    expect(await startOf('2026-09-06')).toBe('2026-09-06T07:00:00.000Z');
  });
});
