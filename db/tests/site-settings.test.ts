// Plan step 1.8 (20261114000000_groups_and_site_settings.sql): the site's settings (the semesters without material
// hidden), which live only in public and never go through the draft, and the notes' group, kept by save_note(). Also
// «avance intacto» of a note that changes assessment (the Seminario 8 of Biocel, from the Certamen 2 to the 3): the
// same id, slug, code and version after publishing, so that the students' readings (by note id) follow it.
import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { ContentBundle } from '@qv/schema';
import { CloudTarget } from '@qv/importer';
import type { MediaStore } from '@qv/importer';
import { BC, article, catalog, image, serviceRpc, withHash } from './import-fixtures';
import { asUser, createDatabase } from './pglite';

let db: PGlite;
const store: MediaStore = { has: async () => true, put: async () => {} };
const published = new CloudTarget({ db: serviceRpc(() => db, []), store });
const draft = new CloudTarget({ db: serviceRpc(() => db, [], 'draft'), store });

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows;
const service = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  db.transaction(async (tx) => {
    await tx.exec('set local role service_role');
    return (await tx.query<T>(sql, params)).rows;
  });

const BC3 = 'biologia-celular/certamen-3';
const catalogWithC3 = {
  ...catalog,
  assessments: [
    ...catalog.assessments,
    { id: BC3, courseId: 'biologia-celular', name: 'Certamen 3', position: 3 },
  ],
};

/** The Seminario 8, in one assessment or the other, with or without a group (outside what the reader sees). */
function seminar(assessmentId: string, group?: string) {
  const a = article('AP-BC-C2-SEM8', assessmentId, 'Comunicación intercelular', 10);
  const { hash: _hash, versionHash, updatedAt, ...rest } = a;
  return {
    ...withHash({ ...rest, ...(group ? { group } : {}) }),
    versionHash,
    updatedAt,
  };
}

async function save(target: CloudTarget, notes: ReturnType<typeof seminar>[]) {
  const bundle = ContentBundle.parse({ ...catalogWithC3, notes });
  const media = new Map(notes.flatMap((n) => n.media).map((k) => [k, image(k)]));
  return target.save(bundle, media);
}

async function publish() {
  const fp = (await service<{ r: string }>('select public.release_fingerprint() as r'))[0]!.r;
  for (const mark of ['phone', 'answers']) {
    await service('select public.set_release_mark($1, $2, true, $3)', [fp, mark, 'dueño']);
  }
  return (
    await service<{ r: Record<string, unknown> }>('select public.publish_release($1::jsonb) as r', [
      {
        fingerprint: fp,
        title: 'Biología celular · Certamen 3',
        schemaVersion: 1,
        checks: { blocking: 0, ready: true, warnings: [] },
        by: 'dueno@ug.uchile.cl',
      },
    ])
  )[0]!.r;
}

const noteRow = async (schema: 'public' | 'draft') =>
  (
    await q<{
      id: string;
      slug: string;
      code: string;
      assessment_id: string;
      version: number;
      published_at: string;
      group: string | null;
    }>(
      `select id, slug, code, assessment_id, version, published_at::text, document ->> 'group' as group
         from ${schema}.notes where id = 'AP-BC-C2-SEM8'`,
    )
  )[0];

beforeEach(async () => {
  db = await createDatabase('content');
});

describe('the site settings', () => {
  it('start with nothing hidden, and the function changes them and says who and when', async () => {
    expect((await service<{ r: unknown }>('select public.site_settings() as r'))[0]!.r).toEqual({
      hideEmptySemesters: false,
      updatedAt: null,
      updatedBy: null,
    });
    const r = (
      await service<{ r: { hideEmptySemesters: boolean; updatedAt: string; updatedBy: string } }>(
        'select public.set_site_settings($1::jsonb) as r',
        [{ hideEmptySemesters: true, by: 'dueno@ug.uchile.cl' }],
      )
    )[0]!.r;
    expect(r).toMatchObject({ hideEmptySemesters: true, updatedBy: 'dueno@ug.uchile.cl' });
    expect(r.updatedAt).toEqual(expect.any(String));
    expect((await service<{ r: unknown }>('select public.site_settings() as r'))[0]!.r).toEqual(r);
    expect(await q('select count(*)::int as n from public.site_settings')).toEqual([{ n: 1 }]);
  });

  it('refuse what is not a boolean and somebody', async () => {
    for (const p of [
      {},
      { hideEmptySemesters: 'true', by: 'x' },
      { hideEmptySemesters: true },
      { hideEmptySemesters: true, by: '  ' },
    ]) {
      await expect(service('select public.set_site_settings($1::jsonb)', [p])).rejects.toThrow(
        /set_site_settings: invalid/,
      );
    }
  });

  it('only service_role, and only through the two functions', async () => {
    await expect(service('select * from public.site_settings')).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      service('update public.site_settings set hide_empty_semesters = true where id'),
    ).rejects.toThrow(/permission denied/);
    for (const claims of [
      null,
      { sub: '00000000-0000-4000-8000-000000000001', email: 'a@ug.uchile.cl' },
    ]) {
      for (const sql of [
        'select public.site_settings()',
        `select public.set_site_settings('{"hideEmptySemesters": true, "by": "x"}')`,
        'select * from public.site_settings',
      ]) {
        await expect(
          asUser(db, claims, (tx) => tx.query(sql)),
          sql,
        ).rejects.toThrow(/permission denied/);
      }
    }
  });

  it('are not in the draft: the draft never has them, publishing never touches them (drift 0)', async () => {
    expect(
      await q(
        `select relname as name from pg_class where relnamespace = 'draft'::regnamespace and relname = 'site_settings'
         union all
         select proname from pg_proc where pronamespace = 'draft'::regnamespace
            and proname in ('site_settings', 'set_site_settings')`,
      ),
    ).toEqual([]);
    expect(await q("select tbl from public.release_tables() where tbl = 'site_settings'")).toEqual(
      [],
    );
    expect(await q('select * from public.draft_drift()')).toEqual([]);
    await service('select public.set_site_settings($1::jsonb)', [
      { hideEmptySemesters: true, by: 'dueno@ug.uchile.cl' },
    ]);
    // Emptying the draft, importing to it and publishing leave the setting as it was.
    await save(published, [seminar(BC)]);
    await service('select public.reset_draft()');
    await save(draft, [seminar(BC3)]);
    await publish();
    expect(
      (
        await service<{ r: { hideEmptySemesters: boolean } }>('select public.site_settings() as r')
      )[0]!.r.hideEmptySemesters,
    ).toBe(true);
  });
});

describe('a note that changes assessment, and its group', () => {
  it('keeps its id, slug, code, version and «Creado el» when published in the other assessment', async () => {
    await save(published, [seminar(BC)]);
    const before = (await noteRow('public'))!;
    expect(before).toMatchObject({ assessment_id: BC, version: 1, group: null });
    await service('select public.reset_draft()');

    // To the Certamen 3, and in a group: what the reader sees is the same.
    await save(draft, [seminar(BC3, 'Semana 9')]);
    expect(await noteRow('draft')).toMatchObject({ assessment_id: BC3, group: 'Semana 9' });
    expect(await publish()).toMatchObject({ title: 'Biología celular · Certamen 3' });
    const after = (await noteRow('public'))!;
    expect(after).toEqual({ ...before, assessment_id: BC3, group: 'Semana 9' });
    // The same row (the students' readings hang from its id): one note, no new one.
    expect(await q('select count(*)::int as n from public.notes')).toEqual([{ n: 1 }]);
    expect(await q('select * from public.draft_pending_changes()')).toEqual([]);
  });

  it('save_note() keeps the group, and changing only the group does not raise the version', async () => {
    await save(published, [seminar(BC, 'Semana 1')]);
    expect(await noteRow('public')).toMatchObject({ group: 'Semana 1', version: 1 });
    await save(published, [seminar(BC, 'Semana 2')]);
    expect(await noteRow('public')).toMatchObject({ group: 'Semana 2', version: 1 });
    await save(published, [seminar(BC)]);
    expect(await noteRow('public')).toMatchObject({ group: null, version: 1 });
  });
});
