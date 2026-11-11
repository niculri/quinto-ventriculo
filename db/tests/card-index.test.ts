// Plan step 3.3 (ANK-6, ANK-8): the card browser's index, one file per assessment in the image store, and the row of the
// content database that says which one is current (20261117000000_card_browser_index.sql). The real importer and the
// real `npm run unpublish` against every migration (PGlite), with a fake R2: the draft and publishing (step 1.7), undoing
// it, the thumbnails, taking a deck or an image off the site.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CloudTarget, unpublish } from '@qv/importer';
import type { MediaRemover, MediaStore, SaveScope } from '@qv/importer';
import { CardIndex, ContentBundle, cardIndexKey } from '@qv/schema';
import {
  AN,
  BC,
  ankiNote,
  bundleOf,
  everything,
  leafOf,
  noteType,
  only,
  serviceRpc,
  withHash,
} from './import-fixtures';
import type { Parts } from './import-fixtures';
import { createDatabase } from './pglite';

let db: PGlite;
const calls: { fn: string; args: Record<string, unknown> }[] = [];
const stored = new Map<string, Buffer>();
/** Every request to the store and to the database, in order. */
let events: string[] = [];
const store: MediaStore & MediaRemover = {
  async has(key) {
    events.push(`has ${key}`);
    return stored.has(key);
  },
  async put(key, body) {
    events.push(`put ${key}`);
    stored.set(key, body);
  },
  async delete(key) {
    events.push(`delete ${key}`);
    stored.delete(key);
  },
  async deletePrefix(prefix) {
    events.push(`deletePrefix ${prefix}`);
    const keys = [...stored.keys()].filter((k) => k.startsWith(prefix));
    for (const k of keys) stored.delete(k);
    return keys.length;
  },
};
const logged = (db: () => PGlite, schema: 'public' | 'draft') => {
  const rpc = serviceRpc(db, calls, schema);
  return {
    rpc: (fn: string, args: Record<string, unknown>) => {
      events.push(`rpc ${fn}`);
      return rpc.rpc(fn, args);
    },
  };
};
// Thumbnails from the fixtures' made-up images (they are not real WebP): what matters is which and when.
const thumbnail = async (webp: Buffer) => Buffer.concat([Buffer.from('thumb:'), webp]);
const draft = new CloudTarget({ db: logged(() => db, 'draft'), store, thumbnail });
const published = new CloudTarget({ db: logged(() => db, 'public'), store, thumbnail });
const FULL: SaveScope = { notes: true, decks: true, tests: true };

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows;
const service = async <T>(sql: string, params: unknown[] = []) =>
  db.transaction(async (tx) => {
    await tx.exec('set local role service_role');
    return (await tx.query<T>(sql, params)).rows;
  });
const rows = (schema: 'public' | 'draft') =>
  q<{ assessment_id: string; hash: string; note_count: number; card_count: number }>(
    `select assessment_id, hash, note_count, card_count from ${schema}.anki_browse_indexes order by 1`,
  );
const catalogRows = async (schema: 'public' | 'draft' = 'public') =>
  (await service<{ r: unknown }>(`select ${schema}.anki_browse_indexes() as r`))[0]!.r as {
    assessmentId: string;
    hash: string;
    noteCount: number;
    cardCount: number;
    bytes: number;
  }[];
const indexOf = (assessmentId: string, hash: string) =>
  CardIndex.parse(JSON.parse(gunzipSync(stored.get(cardIndexKey(assessmentId, hash))!).toString()));

const OCCLUSION_TYPE = {
  id: '1607392322',
  name: 'Oclusión',
  kind: 'cloze' as const,
  occlusion: true,
  fields: ['Oclusión', 'Imagen', 'Encabezado'],
  templates: [{ name: 'Oclusión', qfmt: '{{cloze:Oclusión}}', afmt: '{{cloze:Oclusión}}' }],
  css: '',
  sortField: 2,
};
const IMAGE = 'cards/0123456789abcdef0123456789abcdef.webp';
const THUMB = 'cards/thumb/0123456789abcdef0123456789abcdef.webp';
/** An occlusion of BC with a figure (`IMAGE`) and two shapes. */
const occlusion = () => {
  const base = (({ hash: _h, updatedAt: _u, ...rest }) => rest)(ankiNote('io-1', BC, 'Lámina'));
  return {
    ...withHash({
      ...base,
      noteTypeId: OCCLUSION_TYPE.id,
      tags: ['profe'],
      fields: {
        Oclusión:
          '{{c1::image-occlusion:rect:left=.1:top=.1:width=.1:height=.1:oi=1}}<br>{{c2::image-occlusion:rect:left=.5:top=.5:width=.1:height=.1:oi=1}}',
        Imagen: `<img src="lamina.png">`,
        Encabezado: 'Vértebra lumbar',
      },
      cards: [0, 1].map((ord) => ({
        ord,
        deckId: leafOf(BC),
        frontHtml: `<div><img data-media="${IMAGE}"></div>`,
        backHtml: `<div><img data-media="${IMAGE}"></div>`,
        sortField: 'Vértebra lumbar',
      })),
      media: [IMAGE],
    }),
    updatedAt: '2026-11-06T12:00:00.000Z',
  };
};
const withOcclusion = (): Parts => {
  const p = everything();
  p.ankiNotes.push(occlusion() as unknown as Parts['ankiNotes'][number]);
  return p;
};
/** The bundle of `p`, with the occlusion's note type when it has it. */
const bundleWith = (p: Parts) => {
  const { bundle, media } = bundleOf(p);
  const types = p.ankiNotes.some((n) => n.noteTypeId === OCCLUSION_TYPE.id)
    ? [noteType, OCCLUSION_TYPE]
    : bundle.ankiNoteTypes;
  return { bundle: ContentBundle.parse({ ...bundle, ankiNoteTypes: types }), media };
};
const save = (target: CloudTarget, p: Parts, scope: SaveScope = FULL) => {
  const { bundle, media } = bundleWith(p);
  calls.length = 0;
  events = [];
  return target.save(bundle, media, scope);
};

const fingerprint = async () =>
  (await service<{ r: string }>('select public.release_fingerprint() as r'))[0]!.r;
async function publish() {
  const fp = await fingerprint();
  for (const mark of ['phone', 'answers']) {
    await service('select public.set_release_mark($1, $2, true, $3)', [fp, mark, 'dueño']);
  }
  return (
    await service<{ r: { id: number } }>('select public.publish_release($1::jsonb) as r', [
      {
        fingerprint: fp,
        title: 'Prueba',
        schemaVersion: 1,
        checks: { blocking: 0, ready: true, warnings: [] },
        by: 'dueno@ug.uchile.cl',
      },
    ])
  )[0]!.r;
}
const revert = (id: number) =>
  service('select public.revert_release($1::jsonb)', [{ id, by: 'dueno@ug.uchile.cl' }]);

let folder: string;
let listFile: string;
beforeEach(async () => {
  db = await createDatabase('content');
  stored.clear();
  calls.length = 0;
  events = [];
  folder = await mkdtemp(join(tmpdir(), 'qv-card-index-'));
  listFile = join(folder, 'unpublished.json');
  await writeFile(listFile, '{"items":[]}\n');
});
afterEach(() => rm(folder, { recursive: true, force: true }));

describe('the card browser index (step 3.3)', () => {
  it('goes to the draft with the import, its file and thumbnails first; publishing and undoing take the row', async () => {
    const report = await save(draft, withOcclusion());
    expect(report).toMatchObject({ indexesWritten: 2, indexesUnchanged: 0, thumbsUploaded: 1 });
    const inDraft = await rows('draft');
    expect(inDraft.map((r) => [r.assessment_id, r.note_count, r.card_count])).toEqual([
      [AN, 1, 1],
      [BC, 4, 5],
    ]);
    // Public does not have it until it is published.
    expect(await rows('public')).toEqual([]);
    // The thumbnail before the file, and both before the database names them.
    const bcKey = cardIndexKey(BC, inDraft[1]!.hash);
    const at = (e: string) => events.indexOf(e);
    expect(at(`put ${THUMB}`)).toBeGreaterThanOrEqual(0);
    expect(at(`put ${THUMB}`)).toBeLessThan(at(`put ${bcKey}`));
    expect(at(`put ${bcKey}`)).toBeLessThan(at('rpc save_anki_browse_indexes'));
    expect(stored.get(THUMB)!.toString()).toBe(`thumb:${IMAGE}`);

    // What the list needs of the occlusion.
    const index = indexOf(BC, inDraft[1]!.hash);
    expect(index.notes.find((n) => n.guid === 'io-1')).toMatchObject({
      kind: 'occlusion',
      topic: 'Vértebra lumbar',
      front: 'Vértebra lumbar',
      thumb: THUMB,
      labels: 2,
      origin: ['profe'],
      cards: [
        { ord: 0, deckId: leafOf(BC) },
        { ord: 1, deckId: leafOf(BC) },
      ],
    });
    expect(index.notes.find((n) => n.guid === 'bc-1')).toMatchObject({
      kind: 'cloze',
      front: 'uno',
      thumb: null,
    });

    const { id } = await publish();
    expect(await rows('public')).toEqual(inDraft);
    expect((await catalogRows()).map((r) => [r.assessmentId, r.hash])).toEqual(
      inDraft.map((r) => [r.assessment_id, r.hash]),
    );
    expect(await q('select * from public.draft_pending_changes()')).toEqual([]);

    // A new version of BC, published and undone: the row goes back, and its file is still in the store.
    const p = withOcclusion();
    p.ankiNotes[0] = ankiNote('bc-1', BC, 'uno, corregida');
    await save(draft, p);
    const second = await publish();
    const after = await rows('public');
    expect(after[1]!.hash).not.toBe(inDraft[1]!.hash);
    expect(after[0]).toEqual(inDraft[0]);
    await revert(second.id);
    expect(await rows('public')).toEqual(inDraft);
    expect(stored.has(bcKey)).toBe(true);
    expect(id).toBeLessThan(second.id);
  });

  it('an import without changes asks nothing more (the hashes come with import_state)', async () => {
    await save(draft, withOcclusion());
    await save(draft, withOcclusion());
    expect(calls.map((c) => c.fn)).toEqual([
      'import_state',
      'sync_catalog',
      'save_anki_catalog',
      'prune_content',
    ]);
    expect(events.filter((e) => !e.startsWith('rpc'))).toEqual([]);
  });

  it('a change in one assessment writes only its index; an assessment left without cards loses its own', async () => {
    await save(draft, withOcclusion());
    const before = await rows('draft');
    const p = withOcclusion();
    p.ankiNotes[1] = ankiNote('bc-2', BC, 'dos, corregida');
    const r = await save(draft, p);
    expect(r).toMatchObject({ indexesWritten: 1, indexesUnchanged: 1, thumbsUploaded: 0 });
    // The thumbnail is not asked for again: it is the new file that was not in the store.
    expect(events.filter((e) => e.includes('thumb'))).toEqual([`has ${THUMB}`]);
    const after = await rows('draft');
    expect(after[0]).toEqual(before[0]);
    expect(after[1]!.hash).not.toBe(before[1]!.hash);

    // Anatomía I imported alone, without its notes: its index goes (and BC's stays).
    const none: Parts = { ...only(everything(), AN), ankiNotes: [] };
    const out = await save(draft, none, { ...FULL, assessments: [AN] });
    expect(out).toMatchObject({ indexesWritten: 0, indexesRemoved: 1 });
    expect((await rows('draft')).map((x) => x.assessment_id)).toEqual([BC]);
  });

  it('discarding an assessment of the draft brings back its index as published', async () => {
    await save(published, withOcclusion());
    const pub = await rows('public');
    await service('select public.reset_draft()');
    const p = withOcclusion();
    p.ankiNotes[0] = ankiNote('bc-1', BC, 'uno, en el borrador');
    await save(draft, p);
    expect((await rows('draft'))[1]!.hash).not.toBe(pub[1]!.hash);
    await service('select public.discard_draft_assessment($1)', [BC]);
    expect(await rows('draft')).toEqual(pub);
    expect(
      await q(
        `select to_jsonb(d) = to_jsonb(p) as same from draft.anki_browse_indexes d
           join public.anki_browse_indexes p using (assessment_id)`,
      ),
    ).toEqual([{ same: true }, { same: true }]);
  });

  it('taking a deck off the site takes its assessment’s index out of public and the draft, and deletes its files', async () => {
    await save(published, withOcclusion());
    await service('select public.reset_draft()');
    expect((await rows('draft')).map((r) => r.assessment_id)).toEqual([AN, BC]);
    const oldBc = [...stored.keys()].filter((k) => k.startsWith(`browse/${BC}/`));
    expect(oldBc).toHaveLength(1);

    const out = await unpublish({
      db: serviceRpc(() => db, calls),
      store,
      listFile,
      manifest: { notes: [], tests: [] },
      kind: 'deck',
      id: leafOf(BC),
      reason: 'Prueba',
      by: 'dueño',
      confirm: async () => true,
    });
    expect(out.applied).toBe(true);
    expect(out.indexFiles).toBe(1);
    expect((await rows('public')).map((r) => r.assessment_id)).toEqual([AN]);
    expect((await rows('draft')).map((r) => r.assessment_id)).toEqual([AN]);
    expect([...stored.keys()].filter((k) => k.startsWith('browse/'))).toEqual(
      [...stored.keys()].filter((k) => k.startsWith(`browse/${AN}/`)),
    );
  });

  it('a deck only in the draft (already in the list): its index leaves the draft too', async () => {
    await save(draft, withOcclusion());
    await writeFile(
      listFile,
      JSON.stringify({
        items: [
          { kind: 'deck', id: leafOf(BC), reason: 'Prueba', date: '2026-11-11', by: 'dueño' },
        ],
      }),
    );
    const out = await unpublish({
      db: serviceRpc(() => db, calls),
      store,
      listFile,
      manifest: { notes: [], tests: [] },
      kind: 'deck',
      id: leafOf(BC),
      reason: 'Prueba',
      by: 'dueño',
      confirm: async () => true,
    });
    expect(out).toMatchObject({ applied: false, alreadyListed: true, draft: { found: true } });
    expect((await rows('draft')).map((r) => r.assessment_id)).toEqual([AN]);
    expect([...stored.keys()].some((k) => k.startsWith(`browse/${BC}/`))).toBe(false);
  });

  it('taking an image off the site deletes its thumbnail too', async () => {
    await save(published, withOcclusion());
    expect(stored.has(THUMB)).toBe(true);
    const out = await unpublish({
      db: serviceRpc(() => db, calls),
      store,
      listFile,
      manifest: { notes: [], tests: [] },
      kind: 'image',
      id: IMAGE,
      reason: 'Prueba',
      by: 'dueño',
      confirm: async () => true,
    });
    expect(out.applied).toBe(true);
    expect(stored.has(IMAGE)).toBe(false);
    expect(stored.has(THUMB)).toBe(false);
  });

  it('nobody but the service reads or writes the rows, and they only through the functions', async () => {
    await save(published, withOcclusion());
    for (const role of ['anon', 'authenticated']) {
      await expect(
        db.transaction(async (tx) => {
          await tx.exec(`set local role ${role}`);
          return tx.query('select public.anki_browse_indexes()');
        }),
      ).rejects.toThrow(/permission denied/);
    }
    await expect(
      db.transaction(async (tx) => {
        await tx.exec('set local role service_role');
        return tx.query('select * from public.anki_browse_indexes');
      }),
    ).rejects.toThrow(/permission denied/);
    expect(await catalogRows()).toHaveLength(2);
  });

  it('an importer against a content database from before this step writes no index and does not fail', async () => {
    db = await createDatabase('content', [], '20261117000000_card_browser_index.sql');
    const report = await save(published, withOcclusion());
    expect(report).toMatchObject({ changedCards: expect.any(Array), indexesWritten: 0 });
    expect(calls.map((c) => c.fn)).not.toContain('save_anki_browse_indexes');
    expect([...stored.keys()].some((k) => k.startsWith('browse/'))).toBe(false);
  });
});
