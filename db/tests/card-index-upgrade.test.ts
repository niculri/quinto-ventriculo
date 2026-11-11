// Revisión de cero (3.3): 20261117000000_card_browser_index.sql on a content database as production has it, with its
// last publication still undoable. The migration adds a published table (anki_browse_indexes), which changes
// release_shape() and public's digests; without its first and last blocks, the publication online could not be undone
// any more («migrated») although undoing it touches no row of the new table. It still can, and leaves public as it was
// before it; a publication that could not be undone before the migration still cannot.
import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { CloudTarget } from '@qv/importer';
import type { MediaStore } from '@qv/importer';
import { BC, ankiNote, article, bundleOf, everything, serviceRpc } from './import-fixtures';
import type { Parts } from './import-fixtures';
import { applyMigration, createDatabase } from './pglite';

const MIGRATION = '20261117000000_card_browser_index.sql';

let db: PGlite;
// Every file is «already there»: an import writes its rows (an index included) without making thumbnails.
const store: MediaStore = { has: async () => true, put: async () => {} };
const published = new CloudTarget({ db: serviceRpc(() => db, []), store });
const draft = new CloudTarget({ db: serviceRpc(() => db, [], 'draft'), store });
const save = (target: CloudTarget, p: Parts) => {
  const { bundle, media } = bundleOf(p);
  return target.save(bundle, media);
};

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows;
const service = async <T>(sql: string, params: unknown[] = []) =>
  db.transaction(async (tx) => {
    await tx.exec('set local role service_role');
    return (await tx.query<T>(sql, params)).rows;
  });

/** What public has in each table a publication takes (those before the migration), as text. */
async function publicContent(names: string[]) {
  const out: Record<string, string> = {};
  for (const t of names) {
    out[t] = (
      await q<{ r: string }>(
        `select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text), '[]')::text as r from public.${t} x`,
      )
    )[0]!.r;
  }
  return out;
}
const tables = async () =>
  (await q<{ tbl: string }>('select tbl from public.release_tables() order by ord')).map(
    (r) => r.tbl,
  );

async function publish() {
  const fp = (await service<{ r: string }>('select public.release_fingerprint() as r'))[0]!.r;
  for (const mark of ['phone', 'answers']) {
    await service('select public.set_release_mark($1, $2, true, $3)', [fp, mark, 'dueño']);
  }
  return (
    await service<{ r: { id: number } }>('select public.publish_release($1::jsonb) as r', [
      {
        fingerprint: fp,
        title: 'Biología celular · Certamen 2',
        schemaVersion: 1,
        checks: { blocking: 0, ready: true, warnings: [] },
        by: 'dueno@ug.uchile.cl',
      },
    ])
  )[0]!.r;
}
const revert = async (id: number) =>
  (
    await service<{ r: Record<string, unknown> }>('select public.revert_release($1::jsonb) as r', [
      { id, by: 'dueno@ug.uchile.cl' },
    ])
  )[0]!.r;

/** A new version: an article and an Anki note changed. */
const changed = (): Parts => {
  const p = everything();
  p.notes[0] = article('AP-BC-C2-08', BC, 'Transcripción corregida', 1);
  p.ankiNotes[0] = ankiNote('bc-1', BC, 'uno corregido');
  return p;
};

let before: Record<string, string>;
let names: string[];

beforeEach(async () => {
  db = await createDatabase('content', [], MIGRATION);
  await save(published, everything());
  await service('select public.reset_draft()');
  names = await tables();
  before = await publicContent(names);
  await save(draft, changed());
});

describe('the publication online, after the card browser migration (Revisión de cero, 3.3)', () => {
  it('can still be undone, and undoing it leaves public as it was before it', async () => {
    const { id } = await publish();
    await applyMigration(db, 'content', MIGRATION);
    expect(await tables()).toContain('anki_browse_indexes');
    const r = await revert(id);
    expect(r).toMatchObject({ id, changes: { notes: { update: 1 }, anki_notes: { update: 1 } } });
    expect(await publicContent(names)).toEqual(before);
    expect(await q('select * from public.anki_browse_indexes')).toEqual([]);
    expect(await q('select status from public.releases')).toEqual([{ status: 'reverted' }]);
  });

  it('also with an import to the draft in between, which writes the draft’s index and not public’s', async () => {
    const { id } = await publish();
    await applyMigration(db, 'content', MIGRATION);
    const p = changed();
    p.ankiNotes[1] = ankiNote('bc-2', BC, 'dos corregido');
    await save(draft, p);
    expect((await q('select assessment_id from draft.anki_browse_indexes')).length).toBeGreaterThan(
      0,
    );
    await revert(id);
    expect(await publicContent(names)).toEqual(before);
    expect(await q('select * from public.anki_browse_indexes')).toEqual([]);
    // What was undone stays in the draft, with its index, to publish again.
    expect((await q('select assessment_id from draft.anki_browse_indexes')).length).toBeGreaterThan(
      0,
    );
  });

  it('a publication that could not be undone before the migration still cannot', async () => {
    const { id } = await publish();
    // Public changed after it (by hand, the draft too, so that the migration's rebuild_draft() goes on): undoing
    // would put back what is not its «before».
    await db.exec(`update public.anki_notes set hash = 'a mano' where guid = 'bc-1';
      update draft.anki_notes set hash = 'a mano' where guid = 'bc-1';`);
    await applyMigration(db, 'content', MIGRATION);
    await expect(revert(id)).rejects.toThrow(/revert_release: migrated/);
    expect(await q('select status from public.releases')).toEqual([{ status: 'published' }]);
  });

  it('a migration after it that adds a column still makes it impossible to undo', async () => {
    const { id } = await publish();
    await applyMigration(db, 'content', MIGRATION);
    await db.exec(`alter table public.anki_notes add column reading text;
      update public.anki_notes set reading = 'lleno';
      select public.rebuild_draft();`);
    await expect(revert(id)).rejects.toThrow(/revert_release: migrated/);
  });
});
