/**
 * Revisión de cero (1.8): 20261114000000_groups_and_site_settings.sql on the content database as production has it
 * (articles published by the 1.7 flow, the draft equal to what is published), and then what the owner does after it:
 * import everything again to the draft and publish. Nothing already published may change by the migration or by
 * importing the same material again (no new hash, no new version), and the Seminario 8, moved from the Certamen 2 to a
 * Certamen 3 that comes in with the catalog, keeps its row, version and dates.
 */
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { ContentBundle } from '@qv/schema';
import { CloudTarget } from '@qv/importer';
import type { MediaStore } from '@qv/importer';
import { AN, BC, article, catalog, image, serviceRpc, withHash } from './import-fixtures';
import { applyMigration, createDatabase } from './pglite';

const MIGRATION = '20261114000000_groups_and_site_settings.sql';
const BC3 = 'biologia-celular/certamen-3';

let db: PGlite;
const store: MediaStore = { has: async () => true, put: async () => {} };
const published = new CloudTarget({ db: serviceRpc(() => db, []), store });
const draft = new CloudTarget({ db: serviceRpc(() => db, [], 'draft'), store });

/** As the owner in the SQL editor (draft_drift() and draft_pending_changes() are not for the API). */
const q = async (sql: string) => (await db.query(sql)).rows;
const service = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  db.transaction(async (tx) => {
    await tx.exec('set local role service_role');
    return (await tx.query<T>(sql, params)).rows;
  });

/** The Seminario 8 as it is published today: in the Certamen 2, with «Ponte a prueba» to its test. */
function seminar(assessmentId: string, practice: boolean) {
  const a = article('AP-BC-C2-SEM8', assessmentId, 'Comunicación intercelular', 10);
  const { hash: _hash, versionHash, updatedAt, ...rest } = a;
  return {
    ...withHash({
      ...rest,
      kind: 'seminar',
      ...(practice ? { practice: { quizId: 'biologia-celular-certamen-2-practica' } } : {}),
    }),
    versionHash,
    updatedAt,
  };
}

const before = () => [
  article('AP-A1-S3-01', AN, 'Columna vertebral', 1),
  article('AP-BC-C2-10', BC, 'Núcleo celular', 4),
  seminar(BC, true),
];

async function save(target: CloudTarget, notes: unknown[], withC3 = false) {
  const bundle = ContentBundle.parse({
    ...catalog,
    assessments: withC3
      ? [
          ...catalog.assessments,
          { id: BC3, courseId: 'biologia-celular', name: 'Certamen 3', position: 3 },
        ]
      : catalog.assessments,
    notes,
  });
  const media = new Map(bundle.notes.flatMap((n) => n.media).map((k) => [k, image(k)]));
  return target.save(bundle, media);
}

const rows = (schema: 'public' | 'draft') =>
  service(
    `select id, slug, code, assessment_id, kind, position, hash, version, version_hash,
            published_at::text, version_at::text, document
       from ${schema}.notes order by id`,
  );

let publishedBefore: Record<string, unknown>[];

beforeAll(async () => {
  db = await createDatabase('content', [], MIGRATION);
  await save(published, before());
  // After a publication the draft is what is published.
  await service('select public.reset_draft()');
  publishedBefore = await rows('public');
  await applyMigration(db, 'content', MIGRATION);
});

describe('the step 1.8 migration on a database like production', () => {
  it('changes nothing published, leaves the draft equal and without drift, and the switch off', async () => {
    expect(await rows('public')).toEqual(publishedBefore);
    expect(await rows('draft')).toEqual(publishedBefore);
    expect(await q('select * from public.draft_drift()')).toEqual([]);
    expect(await q('select * from public.draft_pending_changes()')).toEqual([]);
    expect((await service<{ r: unknown }>('select public.site_settings() as r'))[0]!.r).toEqual({
      hideEmptySemesters: false,
      updatedAt: null,
      updatedBy: null,
    });
  });

  it('importing the same material again rewrites nothing (the group is not in the hash of a note without one)', async () => {
    const report = await save(draft, before());
    expect(report.changedNotes).toEqual([]);
    expect(await q('select * from public.draft_pending_changes()')).toEqual([]);
  });

  it('the Seminario 8 to the Certamen 3: one format change there, published as the same row, version and dates', async () => {
    const moved = [before()[0], before()[1], seminar(BC3, false)];
    const report = await save(draft, moved, true);
    expect(report.changedNotes).toEqual(['AP-BC-C2-SEM8']);

    const summary = (
      await service<{ r: { catalog: { id: string; op: string }[]; assessments: unknown[] } }>(
        'select public.release_summary() as r',
      )
    )[0]!.r;
    expect(summary.catalog).toEqual([expect.objectContaining({ id: BC3, op: 'added' })]);
    // Nothing comes in nor leaves: it is a change of the same article, in its new assessment.
    expect(summary.assessments).toEqual([
      expect.objectContaining({
        id: BC3,
        articles: { added: 0, removed: 0, content: 0, format: 1 },
      }),
    ]);

    const fp = (await service<{ r: string }>('select public.release_fingerprint() as r'))[0]!.r;
    for (const mark of ['phone', 'answers']) {
      await service('select public.set_release_mark($1, $2, true, $3)', [fp, mark, 'dueño']);
    }
    await service('select public.publish_release($1::jsonb)', [
      {
        fingerprint: fp,
        title: 'Biología celular · Certamen 3',
        schemaVersion: 1,
        checks: { blocking: 0, ready: true, warnings: [] },
        by: 'dueno@ug.uchile.cl',
      },
    ]);
    const after = await rows('public');
    expect(after.map((r) => r.id)).toEqual(publishedBefore.map((r) => r.id));
    const old = publishedBefore.find((r) => r.id === 'AP-BC-C2-SEM8')!;
    const now = after.find((r) => r.id === 'AP-BC-C2-SEM8')!;
    expect(now).toMatchObject({
      slug: old.slug,
      code: old.code,
      version: old.version,
      version_hash: old.version_hash,
      published_at: old.published_at,
      version_at: old.version_at,
      assessment_id: BC3,
    });
    expect((now.document as { practice?: unknown }).practice).toBeUndefined();
    // The other articles, untouched.
    expect(after.filter((r) => r.id !== 'AP-BC-C2-SEM8')).toEqual(
      publishedBefore.filter((r) => r.id !== 'AP-BC-C2-SEM8'),
    );
    expect(await q('select * from public.draft_drift()')).toEqual([]);
  });
});
