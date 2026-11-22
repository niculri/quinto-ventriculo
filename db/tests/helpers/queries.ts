// The queries the tests of a database repeat, bound to the database a file has at that moment (it changes per test).
import type { PGlite } from '@electric-sql/pglite';

export type Queryable = Pick<PGlite, 'query'>;

export function queriesOn(getDb: () => PGlite) {
  /** The rows of a query, as the owner of the database (RLS does not apply). */
  const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await getDb().query<T>(sql, params)).rows;

  /** The rows of a query as `service_role`, the role the Worker and the importer use. */
  const service = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    getDb().transaction(async (tx) => {
      await tx.exec('set local role service_role');
      return (await tx.query<T>(sql, params)).rows;
    });

  /** A transaction as `service_role`. */
  const asService = <T>(fn: (tx: Queryable) => Promise<T>) =>
    getDb().transaction(async (tx) => {
      await tx.exec('set local role service_role');
      return fn(tx);
    });

  return { q, service, asService };
}
