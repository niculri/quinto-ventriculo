// The Database types of packages/db-types are the ones the migrations give: `npm run db:types` rewrites them.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OUTPUT, generateDatabaseTypes } from '../../scripts/dbTypes';

describe.each(['users', 'content'] as const)('packages/db-types/src/%s.ts', (name) => {
  it('is up to date with the migrations', async () => {
    const expected = await generateDatabaseTypes(name);
    expect(readFileSync(OUTPUT(name), 'utf8'), 'run npm run db:types').toBe(expected);
  });
});
