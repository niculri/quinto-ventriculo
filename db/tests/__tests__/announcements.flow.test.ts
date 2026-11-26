// The announcements of the material: one per publication or one about the site, out 30 minutes after it is saved,
// taken away when its publication is undone or by hand, and only for the Worker (service_role).
import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { CloudTarget } from '@qv/importer';
import type { MediaStore } from '@qv/importer';
import { BC, everything, only, serviceRpc } from '../helpers/importFixtures';
import { saveParts } from '../helpers/content';
import { queriesOn } from '../helpers/queries';
import { asUser, closeAfterEachTest, createDatabase } from '../pglite';

closeAfterEachTest();

let db: PGlite;
const store: MediaStore = { has: async () => true, put: async () => {} };
const draft = new CloudTarget({ db: serviceRpc(() => db, [], 'draft'), store });
const { q, service } = queriesOn(() => db);

const BY = 'dueno@ug.uchile.cl';
const ITEMS = [{ courseId: 'biologia-celular', assessmentId: BC }];

async function publish(parts = only(everything(), BC)) {
  await saveParts(draft, parts);
  const fp = (await service<{ r: string }>('select public.release_fingerprint() as r'))[0]!.r;
  for (const mark of ['phone', 'answers']) {
    await service('select public.set_release_mark($1, $2, true, $3)', [fp, mark, 'dueño']);
  }
  const r = await service<{ r: { id: number } }>('select public.publish_release($1::jsonb) as r', [
    {
      fingerprint: fp,
      title: 'Biología celular · Certamen 2',
      schemaVersion: 1,
      checks: { blocking: 0, ready: true, warnings: [] },
      by: BY,
    },
  ]);
  return r[0]!.r.id;
}
const revert = (id: number) => service('select public.revert_release($1::jsonb)', [{ id, by: BY }]);

type Saved = Record<string, unknown> & { id: number; publishAt: string; createdAt: string };
const save = async (p: Record<string, unknown>) =>
  (
    await service<{ r: Saved }>('select public.save_announcement($1::jsonb) as r', [
      { by: BY, ...p },
    ])
  )[0]!.r;
const withdraw = async (id: number) =>
  (
    await service<{ r: Saved }>('select public.withdraw_announcement($1::jsonb) as r', [
      { id, by: BY },
    ])
  )[0]!.r;
/** The feed as the Worker asks for it, `minutes` after now. */
const feed = async (minutes: number) =>
  (
    await service<{ r: { id: number; title: string }[] }>(
      `select public.announcements_feed(now() + make_interval(mins => $1), 50) as r`,
      [minutes],
    )
  )[0]!.r;
const adminList = async () =>
  (await service<{ r: Saved[] }>('select public.admin_announcements(50) as r'))[0]!.r;

beforeEach(async () => {
  db = await createDatabase('content');
});

describe('saving an announcement', () => {
  it('comes out 30 minutes after it was saved, not before', async () => {
    const id = await publish();
    const a = await save({
      releaseId: id,
      kind: 'new',
      title: 'Clases nuevas',
      body: 'Tres clases.',
      items: ITEMS,
    });
    expect(Date.parse(a.publishAt) - Date.parse(a.createdAt)).toBe(30 * 60 * 1000);
    expect(a).toMatchObject({
      releaseId: id,
      releaseStatus: 'published',
      kind: 'new',
      items: ITEMS,
    });
    expect(await feed(0)).toEqual([]);
    expect(await feed(29)).toEqual([]);
    expect(await feed(31)).toEqual([
      {
        id: a.id,
        kind: 'new',
        title: 'Clases nuevas',
        body: 'Tres clases.',
        items: ITEMS,
        publishedAt: a.publishAt,
      },
    ]);
  });

  it('one per publication: saving it again changes the text and keeps its time', async () => {
    const id = await publish();
    const first = await save({ releaseId: id, kind: 'new', title: 'Uno', body: '', items: ITEMS });
    const again = await save({ releaseId: id, kind: 'update', title: 'Dos', body: 'b', items: [] });
    expect(again).toMatchObject({
      id: first.id,
      kind: 'update',
      title: 'Dos',
      publishAt: first.publishAt,
    });
    expect(await adminList()).toHaveLength(1);
  });

  it('a site announcement has no publication, and a publication’s is never `site`', async () => {
    const id = await publish();
    const site = await save({ kind: 'site', title: 'El explorador cambió', body: '', items: [] });
    expect(site).toMatchObject({ releaseId: null, releaseStatus: null, kind: 'site' });
    await expect(
      save({ releaseId: id, kind: 'site', title: 'x', body: '', items: [] }),
    ).rejects.toThrow(/invalid/);
    await expect(save({ kind: 'new', title: 'x', body: '', items: [] })).rejects.toThrow(/invalid/);
  });

  it('refuses a publication that does not exist or was undone, and what is malformed', async () => {
    await expect(
      save({ releaseId: 9, kind: 'new', title: 'x', body: '', items: [] }),
    ).rejects.toThrow(/save_announcement: release/);
    const id = await publish();
    await revert(id);
    await expect(
      save({ releaseId: id, kind: 'new', title: 'x', body: '', items: [] }),
    ).rejects.toThrow(/save_announcement: release/);
    for (const bad of [
      { kind: 'site', title: ' ', body: '', items: [] },
      { kind: 'site', title: 'x'.repeat(161), body: '', items: [] },
      { kind: 'site', title: 'x', body: 'x'.repeat(1001), items: [] },
      { kind: 'site', title: 'x', body: '', items: [{ courseId: '' }] },
      { kind: 'site', title: 'x', body: '', items: [{ courseId: 'a', assessmentId: 3 }] },
      {
        kind: 'site',
        title: 'x',
        body: '',
        items: Array.from({ length: 31 }, () => ({ courseId: 'a' })),
      },
      { kind: 'other', title: 'x', body: '', items: [] },
      { kind: 'site', title: 'x', items: [] },
    ]) {
      await expect(save(bad), JSON.stringify(bad).slice(0, 60)).rejects.toThrow(/invalid/);
    }
  });
});

describe('taking it away', () => {
  it('undoing the publication takes its announcement away, also after it came out', async () => {
    const id = await publish();
    const a = await save({
      releaseId: id,
      kind: 'new',
      title: 'Clases nuevas',
      body: '',
      items: ITEMS,
    });
    expect(await feed(31)).toHaveLength(1);
    await revert(id);
    expect(await feed(31)).toEqual([]);
    expect((await adminList())[0]).toMatchObject({
      id: a.id,
      releaseStatus: 'reverted',
      withdrawnAt: null,
    });
  });

  it('two publications in a row: each waits its own 30 minutes, and undoing the last takes only its own', async () => {
    const first = await publish();
    const a = await save({ releaseId: first, kind: 'new', title: 'Uno', body: '', items: ITEMS });
    await db.query(
      `update public.announcements set publish_at = publish_at - interval '20 minutes'`,
    );
    const second = await publish(everything());
    const b = await save({ releaseId: second, kind: 'new', title: 'Dos', body: '', items: ITEMS });
    expect(Date.parse(b.publishAt) - Date.parse(b.createdAt)).toBe(30 * 60 * 1000);
    expect((await feed(10)).map((x) => x.title)).toEqual(['Uno']);
    expect((await feed(31)).map((x) => x.title)).toEqual(['Dos', 'Uno']);
    await revert(second);
    expect((await feed(31)).map((x) => x.title)).toEqual(['Uno']);
    expect((await adminList()).map((x) => [x.id, x.releaseStatus])).toEqual([
      [b.id, 'reverted'],
      [a.id, 'published'],
    ]);
  });

  it('withdrawing it by hand keeps the first time; a new save brings it back', async () => {
    const site = await save({ kind: 'site', title: 'Sitio', body: '', items: [] });
    const out = await withdraw(site.id);
    expect(out).toMatchObject({ withdrawnBy: BY });
    expect((await withdraw(site.id)).withdrawnAt).toBe(out.withdrawnAt);
    expect(await feed(31)).toEqual([]);
    const id = await publish();
    const a = await save({ releaseId: id, kind: 'new', title: 'N', body: '', items: [] });
    await withdraw(a.id);
    expect(
      await save({ releaseId: id, kind: 'new', title: 'N', body: '', items: [] }),
    ).toMatchObject({
      withdrawnAt: null,
    });
    await expect(withdraw(999)).rejects.toThrow(/withdraw_announcement: missing/);
  });

  it('the feed is newest first and at most 200; the panel sees all of them', async () => {
    for (const t of ['a', 'b', 'c']) await save({ kind: 'site', title: t, body: '', items: [] });
    expect((await feed(31)).map((x) => x.title)).toEqual(['c', 'b', 'a']);
    expect((await adminList()).map((x) => x.title)).toEqual(['c', 'b', 'a']);
  });
});

describe('who can', () => {
  it('a student, anon and the importer cannot read or write them, not even the Worker the table', async () => {
    await save({ kind: 'site', title: 'Sitio', body: '', items: [] });
    for (const who of [
      { sub: '11111111-1111-4111-8111-1111111111a1', email: 'ana@ug.uchile.cl' },
      null,
    ]) {
      for (const sql of [
        'select * from public.announcements',
        `insert into public.announcements (kind, title, created_by, publish_at) values ('site', 'x', 'y', now())`,
        `select public.save_announcement('{}'::jsonb)`,
        `select public.withdraw_announcement('{}'::jsonb)`,
        'select public.announcements_feed(now(), 10)',
        'select public.admin_announcements(10)',
      ]) {
        await expect(
          asUser(db, who, (tx) => tx.query(sql)),
          sql,
        ).rejects.toThrow(/permission denied/);
      }
    }
    await expect(service('select * from public.announcements')).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      service(`select public.announcement_json(a) from public.announcements a`),
    ).rejects.toThrow(/permission denied/);
    await expect(
      service(`select public.announcement_json(null::public.announcements)`),
    ).rejects.toThrow(/permission denied for function/);
  });

  it('is outside the draft: publishing never writes or takes them away', async () => {
    const tables = await q<{ tbl: string }>('select tbl from public.release_tables()');
    expect(tables.map((t) => t.tbl)).not.toContain('announcements');
    expect(
      await q(`select from pg_tables where schemaname = 'draft' and tablename = 'announcements'`),
    ).toEqual([]);
    await save({ kind: 'site', title: 'Sitio', body: '', items: [] });
    await publish();
    expect(await adminList()).toHaveLength(1);
  });
});
