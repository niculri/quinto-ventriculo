// The migration that turns courses off, on a database that already has the settings and a published catalog:
// nothing published moves, the earlier setting stays, and the old call of the Worker still works.
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { ContentBundle } from '@qv/schema';
import { CloudTarget } from '@qv/importer';
import type { MediaStore } from '@qv/importer';
import { AN, BC, article, catalog, image, serviceRpc } from './import-fixtures';
import { applyMigration, createDatabase } from './pglite';

const MIGRATION = '20261126000000_hidden_courses.sql';

let db: PGlite;
const store: MediaStore = { has: async () => true, put: async () => {} };
const published = new CloudTarget({ db: serviceRpc(() => db, []), store });

const service = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  db.transaction(async (tx) => {
    await tx.exec('set local role service_role');
    return (await tx.query<T>(sql, params)).rows;
  });
const settings = async () =>
  (await service<{ r: unknown }>('select public.site_settings() as r'))[0]!.r;

beforeAll(async () => {
  db = await createDatabase('content', [], MIGRATION);
  const notes = [
    article('AP-A1-S3-01', AN, 'Columna vertebral', 1),
    article('AP-BC-C2-10', BC, 'Núcleo', 4),
  ];
  const bundle = ContentBundle.parse({ ...catalog, notes });
  await published.save(bundle, new Map(notes.flatMap((n) => n.media).map((k) => [k, image(k)])));
  await service('select public.reset_draft()');
  await service('select public.set_site_settings($1::jsonb)', [
    { hideEmptySemesters: true, by: 'dueno@ug.uchile.cl' },
  ]);
});

describe('turning courses off, on a database like production', () => {
  it('keeps the earlier setting, adds an empty list and leaves the published notes and the draft as they were', async () => {
    const notes = await service('select id, hash, version from public.notes order by id');
    await applyMigration(db, 'content', MIGRATION);
    expect(await service('select id, hash, version from public.notes order by id')).toEqual(notes);
    expect(await settings()).toMatchObject({ hideEmptySemesters: true, hiddenCourses: [] });
    expect((await db.query('select * from public.draft_drift()')).rows).toEqual([]);
    expect((await db.query('select * from public.draft_pending_changes()')).rows).toEqual([]);
  });

  it('the call the Worker made before still works, and does not touch the list', async () => {
    await service('select public.set_site_settings($1::jsonb)', [
      { hiddenCourses: ['fisica'], by: 'dueno@ug.uchile.cl' },
    ]);
    await service('select public.set_site_settings($1::jsonb)', [
      { hideEmptySemesters: false, by: 'dueno@ug.uchile.cl' },
    ]);
    expect(await settings()).toMatchObject({
      hideEmptySemesters: false,
      hiddenCourses: ['fisica'],
    });
  });
});
