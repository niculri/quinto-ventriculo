// Before deploying, both production databases must have what this commit's migrations leave (db/<name>/schema): a web
// published before its migration fails for everybody. Read with `npm run db:schema:compare`, a read-only transaction.
import { Refusal } from './deployEnvironment';
import type { DeployEnvironment } from './deployEnvironment';

const ENV_FILE = '.env.cloud';
const DATABASES = [
  { name: 'users', label: 'usuarios', variable: 'USERS_DATABASE_URL' },
  { name: 'content', label: 'contenido', variable: 'CONTENT_DATABASE_URL' },
] as const;
type Database = (typeof DATABASES)[number];

/** The value of `KEY=value` in an env file (`export` and quotes allowed); null when it is not there or is empty. */
export function envFileValue(text: string, key: string): string | null {
  const match = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=(.*)$`, 'm').exec(text);
  if (!match) return null;
  const value = match[1]!.trim().replace(/^(['"])(.*)\1$/, '$2');
  return value === '' ? null : value;
}

/** What production lacks or has different stops the deploy; what only production has (a migration applied ahead) warns. */
export function splitDifferences(lines: readonly string[]): {
  blocking: string[];
  extra: string[];
} {
  const extra = lines.filter((line) => line.startsWith('Not in the repository: '));
  return { blocking: lines.filter((line) => !extra.includes(line)), extra };
}

async function urlOf(env: DeployEnvironment, variable: string): Promise<string | null> {
  const fromShell = env.variable(variable);
  if (fromShell) return fromShell;
  const file = await env.readFile(ENV_FILE);
  return file === null ? null : envFileValue(file, variable);
}

// schemaCompare.ts: 0 the same, 1 with the differences after a first line that says so, 2 when it could not compare.
async function differences(
  env: DeployEnvironment,
  database: Database,
  url: string,
): Promise<string[]> {
  const r = await env.capture(
    'npm',
    ['run', '--silent', 'db:schema:compare', '--', database.name, '--url-env', database.variable],
    { [database.variable]: url, PGCONNECT_TIMEOUT: '20' },
  );
  if (r.code === 0) return [];
  const [first = '', ...rest] = r.stdout.split('\n').filter((line) => line.trim() !== '');
  if (r.code === 1 && first.includes('differs from the snapshot')) return rest;
  const said = r.stderr.trim();
  const why = said === '' ? 'el comando falló sin decir por qué' : said.split('\n').at(-1)!;
  throw new Refusal(
    `No pude leer el esquema de la base de ${database.label} (${database.variable}): ` +
      `${why.replaceAll(url, '<cadena de conexión>')}\n` +
      '  Sin comprobar que producción tiene las migraciones de este commit, no despliego.',
  );
}

export async function checkSchemas(env: DeployEnvironment): Promise<void> {
  const urls = new Map<Database, string>();
  for (const database of DATABASES) {
    const url = await urlOf(env, database.variable);
    if (url) urls.set(database, url);
  }
  const missing = DATABASES.filter((database) => !urls.has(database));
  if (missing.length) {
    throw new Refusal(
      `Falta ${missing.map((d) => d.variable).join(' y ')} (en ${ENV_FILE} o en la terminal): la cadena de conexión ` +
        `de la base de ${missing.map((d) => d.label).join(' y de la de ')}. Con ella compruebo, en solo lectura, que ` +
        'producción tiene todas las migraciones de este commit (ver docs/configuracion.md).',
    );
  }
  const problems: string[] = [];
  for (const [database, url] of urls) {
    const { blocking, extra } = splitDifferences(await differences(env, database, url));
    if (extra.length) {
      env.log(
        `⚠ La base de ${database.label} tiene algo que este commit no trae (¿una migración aplicada antes de ` +
          'fusionar su rama?):',
      );
      extra.forEach((line) => env.log(`    ${line}`));
    }
    if (blocking.length) {
      problems.push(
        `  Base de ${database.label} (migraciones en db/${database.name}/supabase/migrations):`,
        ...blocking.map((line) => `    ${line}`),
      );
    } else {
      env.log(`✓ La base de ${database.label} tiene lo que dejan las migraciones de este commit.`);
    }
  }
  if (problems.length) {
    throw new Refusal(
      `A producción le falta, o tiene distinto, algo que este commit necesita:\n${problems.join('\n')}\n` +
        '  Aplica primero las migraciones que falten (con el sí del dueño) y vuelve a intentar.',
    );
  }
}
