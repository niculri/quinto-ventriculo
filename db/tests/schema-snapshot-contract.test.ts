// The snapshot of each database's schema (db/<name>/schema) is the one the migrations give: `npm run db:schema` rewrites it.
import { describe, expect, it } from 'vitest';
import { generateSnapshot } from '../scripts/schema-snapshot';
import { compareSnapshots } from '../scripts/schema/compare';
import { SNAPSHOT_DIRECTORY, readSnapshot } from '../scripts/schema/files';

describe.each(['users', 'content'] as const)('db/%s/schema', (name) => {
  it('is up to date with the migrations', async () => {
    const expected = await generateSnapshot(name);
    const lines = compareSnapshots(expected, readSnapshot(SNAPSHOT_DIRECTORY(name)));
    expect(lines, 'run npm run db:schema').toEqual([]);
  });
});
