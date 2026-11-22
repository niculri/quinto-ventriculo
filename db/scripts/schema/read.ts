// Reads the catalog of a database: the PGlite of the tests, or a real Postgres through psql (read only).
import { spawn } from 'node:child_process';
import type { PGlite } from '@electric-sql/pglite';
import { catalogStatements, parseCatalog } from './catalog';
import type { Catalog } from './catalog';

export async function readCatalogFromPglite(db: PGlite, schema: string): Promise<Catalog> {
  const { setup, query } = catalogStatements(schema);
  const document = await db.transaction(async (tx) => {
    for (const statement of setup) await tx.exec(statement);
    const { rows } = await tx.query<{ document: string }>(query);
    return rows[0]!.document;
  });
  return parseCatalog(document);
}

/** psql sometimes repeats the connection string in an error (a malformed URI): neither it nor its password is shown. */
export function withoutSecrets(text: string, url: string): string {
  const password = /^[a-z]+:\/\/[^:@/]*:([^@]+)@/i.exec(url)?.[1];
  const clean = text.replaceAll(url, '<connection string>');
  if (!password) return clean;
  return clean.replaceAll(password, '***').replaceAll(decodeURIComponent(password), '***');
}

/** One read-only transaction through `psql`; the connection string goes as an argument, which the runner masks. */
export function readCatalogWithPsql(url: string, schema: string): Promise<Catalog> {
  const { setup, query } = catalogStatements(schema);
  const script = ['begin read only;', ...setup.map((s) => `${s};`), `${query};`, 'commit;'].join(
    '\n',
  );
  return new Promise((resolve, reject) => {
    const psql = spawn('psql', ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', url, '-f', '-'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      // The text of the catalog has accents: it is read as UTF-8 whatever the locale of the machine says.
      env: { ...process.env, PGCLIENTENCODING: 'UTF8' },
    });
    let out = '';
    let err = '';
    psql.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()));
    psql.stderr.on('data', (chunk: Buffer) => (err += chunk.toString()));
    psql.on('error', reject);
    psql.on('close', (code) => {
      if (code !== 0)
        reject(
          new Error(
            `psql failed (${String(code)}): ${withoutSecrets(err.trim().split('\n')[0] ?? '', url)}`,
          ),
        );
      else resolve(parseCatalog(out.trim()));
    });
    psql.stdin.end(script);
  });
}
