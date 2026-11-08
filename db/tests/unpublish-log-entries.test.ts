// Plan step 2.10: «Fuera del sitio» in the administration panel reads unpublish_log with unpublish_log_entries()
// (20261115000000_unpublish_log_entries.sql), only as the service role (the Worker, after is_admin()). What is off the
// site is what is not in the published tables: a piece imported again is «on the site» again.
import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { CloudTarget } from '@qv/importer';
import type { MediaStore } from '@qv/importer';
import { BC, bundleOf, everything, leafOf, serviceRpc } from './import-fixtures';
import { createDatabase } from './pglite';

let db: PGlite;
const store: MediaStore = { has: async () => true, put: async () => {} };
const target = new CloudTarget({ db: serviceRpc(() => db, []), store });

const service = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  db.transaction(async (tx) => {
    await tx.exec('set local role service_role');
    return (await tx.query<T>(sql, params)).rows;
  });
const takeOff = (kind: string, id: string, reason: string) =>
  service(`select public.unpublish_content($1, $2, $3, 'dueño', true)`, [kind, id, reason]);
type Entries = {
  total: number;
  entries: { kind: string; itemId: string; reason: string; onSite: boolean | null }[];
};
const entries = async (max?: number) =>
  (
    await service<{ r: Entries }>(
      max === undefined
        ? 'select public.unpublish_log_entries() as r'
        : 'select public.unpublish_log_entries($1) as r',
      max === undefined ? [] : [max],
    )
  )[0]!.r;

beforeEach(async () => {
  db = await createDatabase('content');
  const { bundle, media } = bundleOf(everything());
  await target.save(bundle, media);
});

describe('unpublish_log_entries()', () => {
  it('empty: nothing was taken off', async () => {
    expect(await entries()).toEqual({ total: 0, entries: [] });
  });

  it('what, when, why and who, newest first, and whether it is on the site again', async () => {
    await takeOff('note', 'AP-BC-C2-08', 'Figura con un error grave');
    await takeOff('quiz', 'practica-bc', 'Clave mal puesta');
    await takeOff('deck', leafOf(BC), 'Mazo de prueba');
    await takeOff('image', 'notes/ap-bc-c2-09.webp', 'Imagen con derechos');
    const r = await entries();
    expect(r.total).toBe(4);
    expect(r.entries.map((e) => [e.kind, e.itemId, e.reason, e.onSite])).toEqual([
      ['image', 'notes/ap-bc-c2-09.webp', 'Imagen con derechos', null],
      ['deck', leafOf(BC), 'Mazo de prueba', false],
      ['quiz', 'practica-bc', 'Clave mal puesta', false],
      ['note', 'AP-BC-C2-08', 'Figura con un error grave', false],
    ]);
    expect(r.entries[3]).toMatchObject({
      title: 'Clase 1',
      by: 'dueño',
      removed: { notes: 1, sections: 1 },
    });
    expect(
      new Date((r.entries[3] as unknown as { doneAt: string }).doneAt).getTime(),
    ).not.toBeNaN();

    // Imported again (taken out of content/unpublished.json): the article and the test are on the site again.
    const { bundle, media } = bundleOf(everything());
    await target.save(bundle, media);
    const again = await entries();
    expect(again.entries.map((e) => [e.itemId, e.onSite])).toEqual([
      ['notes/ap-bc-c2-09.webp', null],
      [leafOf(BC), true],
      ['practica-bc', true],
      ['AP-BC-C2-08', true],
    ]);
    // At most the number asked for (1 to 500); the total says how many there are.
    expect((await entries(2)).entries).toHaveLength(2);
    expect((await entries(0)).entries).toHaveLength(1);
    expect((await entries(2)).total).toBe(4);
  });

  it('only the service role: not anon nor a signed-in person, and the draft does not have it', async () => {
    for (const role of ['anon', 'authenticated']) {
      await expect(
        db.transaction(async (tx) => {
          await tx.exec(`set local role ${role}`);
          return tx.query('select public.unpublish_log_entries()');
        }),
      ).rejects.toThrow(/permission denied/);
    }
    expect(
      (
        await db.query(
          `select 1 from pg_proc where pronamespace = 'draft'::regnamespace and proname = 'unpublish_log_entries'`,
        )
      ).rows,
    ).toEqual([]);
    expect((await db.query('select * from public.draft_drift()')).rows).toEqual([]);
  });
});
