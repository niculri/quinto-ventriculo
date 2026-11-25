// `npm run db:schema:compare -- users --url-env NAME`: a real database's schema (read only, through psql) against the
// repository's snapshot. It exits with 1 and lists what differs, and with 2 when it could not compare.
import { join } from 'node:path';
import { compareSnapshots } from './schema/compare';
import { domainsOf } from './schema/domains';
import { SNAPSHOT_DIRECTORY, readSnapshot } from './schema/files';
import { readCatalogWithPsql } from './schema/read';
import { renderSnapshot } from './schema/render';
import type { DomainOf } from './schema/render';

const USAGE = 'Usage: schema-compare <users|content> --url-env VARIABLE [--snapshot DIRECTORY]';

function argumentsOf(argv: string[]) {
  const [name, ...rest] = argv;
  const option = (flag: string) => {
    const at = rest.indexOf(flag);
    return at < 0 ? undefined : rest[at + 1];
  };
  const urlVariable = option('--url-env');
  if ((name !== 'users' && name !== 'content') || !urlVariable) throw new Error(USAGE);
  const database: 'users' | 'content' = name;
  return {
    name: database,
    urlVariable,
    snapshot: option('--snapshot') ?? SNAPSHOT_DIRECTORY(database),
  };
}

/** The extensions production has besides the ones the migrations install (Supabase's own) are not a difference. */
function installedByMigrations(snapshot: Map<string, string>): string[] {
  const database = snapshot.get('_database.sql') ?? '';
  return [...database.matchAll(/create extension if not exists "([^"]+)"/g)].map((m) => m[1]!);
}

async function main(): Promise<void> {
  const { name, urlVariable, snapshot } = argumentsOf(process.argv.slice(2));
  const url = process.env[urlVariable];
  if (!url) throw new Error(`The variable ${urlVariable} is not set`);

  const expected = readSnapshot(snapshot);
  expected.delete('README.md');
  const known = domainsOf(name);
  // An object nobody placed is shown as a file of its own, as a difference, instead of stopping the comparison.
  const domainOf: DomainOf = (kind, objectName) => {
    try {
      return known(kind, objectName);
    } catch {
      return '_not-in-the-snapshot';
    }
  };
  const catalog = await readCatalogWithPsql(url, 'public');
  const wanted = installedByMigrations(expected);
  catalog.extensions = catalog.extensions.filter((extension) => wanted.includes(extension));
  const lines = compareSnapshots(expected, renderSnapshot(catalog, domainOf));
  if (lines.length === 0) {
    console.log(
      `${name}: the schema of the database is the snapshot of ${join('db', name, 'schema')}`,
    );
  } else {
    console.log(`${name}: the database differs from the snapshot (${lines.length} lines)`);
    console.log(lines.join('\n'));
    process.exitCode = 1;
  }
}

// 2, not 1: whoever runs it (the deploy) tells «it differs» from «it could not be compared».
try {
  await main();
} catch (e) {
  console.error(`schema-compare: ${(e as Error).message}`);
  process.exitCode = 2;
}
