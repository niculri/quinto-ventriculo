// Tests the cloud target: what it sends and in what order, what it spares, what it removes and what it refuses.
import type { ContentBundle } from '@qv/schema';
import { CONTENT_SCHEMA_VERSION } from '@qv/schema';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildBundle } from '../../bundle/build';
import { ImportError } from '../../ImportError';
import type { Manifest } from '../../manifest/schemas';
import { processCardImage, processImage } from '../../media/images';
import type { ProcessedImage } from '../../media/images';
import { createRoot, manifest } from '../../test/importerFixtures';
import { CloudTarget, batches } from '../cloud';
import type { CloudOptions } from '../cloud';
const didNotFail = (): never => {
  throw new Error('it should have failed');
};

describe('the image cache, --assessment and the batches', () => {
  it('batches: in order, by bytes and by count; a piece bigger than the limit goes alone', () => {
    const items = ['a'.repeat(10), 'b'.repeat(10), 'c'.repeat(50), 'd', 'e', 'f'];
    expect(batches(items, 30, 10).map((b) => b.map((x) => x[0]).join(''))).toEqual([
      'ab',
      'c',
      'def',
    ]);
    expect(batches(items, 1000, 2).map((b) => b.length)).toEqual([2, 2, 2]);
    expect(batches([], 10, 10)).toEqual([]);
  });
});

describe('CloudTarget', () => {
  let root: string;
  let bundle: ContentBundle;
  let media: Map<string, ProcessedImage>;

  beforeAll(async () => {
    root = await createRoot();
    const test = join(root, 'Test - Nube');
    await mkdir(join(test, 'preguntas'), { recursive: true });
    await writeFile(join(test, 'test.json'), JSON.stringify({ titulo: 'Nube' }));
    await writeFile(
      join(test, 'preguntas', '01.json'),
      JSON.stringify({ preguntas: [{ id: 'p1', q: 'x', r: 'y' }] }),
    );
    const m: Manifest = {
      ...structuredClone(manifest),
      decks: [
        { assessmentId: 'anatomia-1/certamen-1', decks: [{ apkg: 'mazos/Mazo de prueba.apkg' }] },
      ],
      tests: [
        {
          assessmentId: 'biologia-celular/certamen-2',
          tests: [{ slug: 'nube', position: 1, folder: 'Test - Nube' }],
        },
      ],
    };
    const built = await buildBundle({
      manifest: m,
      root,
      process: processImage,
      processCardImage,
      now: () => new Date('2026-11-22T10:00:00Z'),
    });
    bundle = built.bundle;
    media = built.media;
  });
  afterAll(() => rm(root, { recursive: true, force: true }));

  type Call = { fn: string; args: Record<string, unknown> };
  type Handler = (args: Record<string, unknown>) => unknown;

  /** A database that records the calls and answers each function with its handler, or a quiet default. */
  function fakeDb(handlers: Record<string, Handler | { error: string }> = {}) {
    const calls: Call[] = [];
    const db = {
      rpc: (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        const h = handlers[fn];
        if (h && 'error' in h) return Promise.resolve({ data: null, error: { message: h.error } });
        if (h) return Promise.resolve({ data: h(args), error: null });
        const items = (args.items ?? []) as { id?: string; guid?: string }[];
        const data =
          fn === 'import_state'
            ? { notes: {}, quizzes: {}, ankiNotes: {}, latestChange: 7 }
            : fn === 'anki_card_changes_since'
              ? { changes: [], next: 0, more: false }
              : fn === 'prune_content'
                ? { notes: 0, quizzes: 0, ankiNotes: 0 }
                : fn.startsWith('save_')
                  ? items.map((i) => i.id ?? i.guid)
                  : null;
        return Promise.resolve({ data, error: null });
      },
    };
    return { db, calls, order: () => calls.map((c) => c.fn) };
  }

  function fakeStore(has: string[] = []) {
    const puts: { key: string; type: string }[] = [];
    const events: string[] = [];
    return {
      puts,
      events,
      store: {
        has: (k: string) => {
          events.push(`has ${k}`);
          return Promise.resolve(has.includes(k));
        },
        put: (key: string, _body: Buffer, type: string) => {
          events.push(`put ${key}`);
          puts.push({ key, type });
          return Promise.resolve();
        },
      },
    };
  }

  const target = (db: object, store: object, extra: Partial<CloudOptions> = {}) =>
    new CloudTarget({
      db: db as CloudOptions['db'],
      store: store as CloudOptions['store'],
      thumbnail: async () => Buffer.from('miniatura'),
      ...extra,
    });

  it('goes in order: the state, the images, the catalog, the content, what to remove, the indexes', async () => {
    const { db, order } = fakeDb({
      import_state: () => ({
        notes: {},
        quizzes: {},
        ankiNotes: {},
        latestChange: 7,
        ankiBrowseIndexes: {},
      }),
      save_anki_browse_indexes: () => null,
    });
    const { store, events } = fakeStore();
    await target(db, store).save(bundle, media);
    expect(order()).toEqual([
      'import_state',
      'sync_catalog',
      'save_notes',
      'save_quizzes',
      'save_anki_catalog',
      'save_anki_notes',
      'prune_content',
      'anki_card_changes_since',
      'save_anki_browse_indexes',
    ]);
    const firstCall = events.findIndex((e) => e.startsWith('put '));
    expect(firstCall).toBeGreaterThanOrEqual(0);
  });

  it('only what the database does not have is sent, without what the database computes, and the report tells which', async () => {
    const known = Object.fromEntries(bundle.notes.slice(0, 1).map((n) => [n.id, n.hash]));
    const { db, calls } = fakeDb({
      import_state: () => ({ notes: known, quizzes: {}, ankiNotes: {}, latestChange: 0 }),
      save_notes: (a) => (a.items as { id: string }[]).slice(0, 1).map((n) => n.id),
    });
    const report = await target(db, fakeStore().store).save(bundle, media);
    const sent = calls.find((c) => c.fn === 'save_notes')!.args.items as Record<string, unknown>[];
    expect(sent.map((n) => n.id)).toEqual(bundle.notes.slice(1).map((n) => n.id));
    for (const n of sent) {
      for (const k of ['updatedAt', 'media', 'version', 'publishedAt', 'versionAt']) {
        expect(n).not.toHaveProperty(k);
      }
    }
    expect(report.changedNotes).toEqual([sent[0]!.id]);
    expect(report.unchangedNotes).toEqual(
      bundle.notes.map((n) => n.id).filter((id) => id !== sent[0]!.id),
    );
  });

  it('a test the database already has with the same hash is not sent and is reported as unchanged', async () => {
    const q = bundle.quizzes[0]!;
    const { db, calls } = fakeDb({
      import_state: () => ({
        notes: {},
        quizzes: { [q.id]: q.hash },
        ankiNotes: {},
        latestChange: 0,
      }),
    });
    const report = await target(db, fakeStore().store).save(bundle, media);
    expect(calls.some((c) => c.fn === 'save_quizzes')).toBe(false);
    expect(report.unchangedQuizzes).toEqual([q.id]);
    expect(report.changedQuizzes).toEqual([]);
  });

  it('the images go before anything else is changed; one the store has is not uploaded again', async () => {
    const [firstKey] = [...media.keys()];
    const { db, order } = fakeDb();
    const { store, puts, events } = fakeStore([firstKey!]);
    const report = await target(db, store).save(bundle, media);
    expect(events.every((e) => !e.includes('undefined'))).toBe(true);
    expect(puts.map((p) => p.type).every((t) => t === 'image/webp')).toBe(true);
    expect(puts.map((p) => p.key)).not.toContain(firstKey);
    expect(report.mediaExisting).toBeGreaterThan(0);
    expect(report.mediaUploaded).toBe(puts.length);
    expect(order().indexOf('import_state')).toBe(0);
  });

  it('a piece whose image is missing from the package stops everything before the catalog is touched', async () => {
    const { db, order } = fakeDb();
    const empty = new Map<string, ProcessedImage>();
    const error = await target(db, fakeStore().store)
      .save(bundle, empty)
      .then(didNotFail, (e: unknown) => e as ImportError);
    expect(error.kind).toBe('material');
    expect(error.message).toMatch(/^Faltan \d+ imágenes en el paquete \(.+…\)$/);
    expect(order()).toEqual(['import_state']);
  });

  it('a conflict on what the whole site shares stops after asking, and asks only when scoped to some assessments', async () => {
    const conflict = { kind: 'preset', id: 'P', name: 'P', usedBy: ['a/1'] };
    const { db, calls } = fakeDb({
      import_state: () => ({
        notes: {},
        quizzes: {},
        ankiNotes: {},
        latestChange: 0,
        sharedConflicts: [conflict],
      }),
    });
    await expect(
      target(db, fakeStore().store).save(bundle, media, {
        notes: true,
        decks: true,
        assessments: ['biologia-celular/certamen-2'],
      }),
    ).rejects.toThrow(/cambiaría el preset «P» \(lo usa a\/1\)/);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args.shared).toMatchObject({ presets: bundle.ankiPresets });
    const whole = fakeDb({
      import_state: () => ({
        notes: {},
        quizzes: {},
        ankiNotes: {},
        latestChange: 0,
        sharedConflicts: [],
      }),
    });
    await target(whole.db, fakeStore().store).save(bundle, media);
    expect(whole.calls[0]!.args).toEqual({ assessments: null, shared: null });
    const noDecks = fakeDb();
    await target(noDecks.db, fakeStore().store).save(bundle, media, {
      notes: true,
      decks: false,
      assessments: ['x/1'],
    });
    expect(noDecks.calls[0]!.args.shared).toBeNull();
  });

  it('the scope decides which kinds are sent: no notes, no tests or no decks leave their calls out', async () => {
    const run = async (scope: object) => {
      const { db, order } = fakeDb();
      await target(db, fakeStore().store).save(bundle, media, scope as never);
      return order();
    };
    expect(await run({ notes: false, decks: false, tests: false })).toEqual([
      'import_state',
      'sync_catalog',
    ]);
    expect(await run({ notes: true, decks: false, tests: false })).toEqual([
      'import_state',
      'sync_catalog',
      'save_notes',
      'prune_content',
    ]);
    expect(await run({ notes: false, decks: false })).toEqual([
      'import_state',
      'sync_catalog',
      'save_quizzes',
      'prune_content',
    ]);
  });

  it('the catalog carries the schema version and the list of unpublished pieces, ids and kinds only', async () => {
    const { db, calls } = fakeDb();
    await target(db, fakeStore().store).save(bundle, media, {
      notes: false,
      decks: false,
      tests: false,
      unpublished: [{ kind: 'quiz', id: 'q-1', reason: 'no se manda' } as never],
    });
    const c = calls.find((x) => x.fn === 'sync_catalog')!.args.c as { meta: unknown };
    expect(c.meta).toEqual({
      schemaVersion: CONTENT_SCHEMA_VERSION,
      unpublished: [{ kind: 'quiz', id: 'q-1' }],
    });
  });

  it('a call that fails is an error of the cloud that names the function', async () => {
    const { db } = fakeDb({ save_notes: { error: 'boom' } });
    const error = await target(db, fakeStore().store)
      .save(bundle, media)
      .then(didNotFail, (e: unknown) => e as ImportError);
    expect(error).toBeInstanceOf(ImportError);
    expect(error.kind).toBe('cloud');
    expect(error.message).toBe('save_notes: boom');
  });

  it('big batches are cut by count, and what the database says changed is the union of all of them', async () => {
    const seen: number[] = [];
    const { db } = fakeDb({
      save_anki_notes: (a) => {
        const items = a.items as { guid: string }[];
        seen.push(items.length);
        return items.slice(0, 1).map((n) => n.guid);
      },
    });
    const report = await target(db, fakeStore().store, { maxBatchItems: 3 }).save(bundle, media);
    expect(seen).toEqual([3, 3, 1]);
    expect(report.changedCards).toHaveLength(3);
    expect(report.unchangedCards).toHaveLength(bundle.ankiNotes.length - 3);
  });

  it('what is removed comes only from the pieces brought complete, and the database’s answer fills the report', async () => {
    const { db, calls } = fakeDb({ prune_content: () => ({ notes: 2, quizzes: 1, ankiNotes: 5 }) });
    const report = await target(db, fakeStore().store).save(bundle, media);
    const keep = calls.find((c) => c.fn === 'prune_content')!.args.keep as Record<string, unknown>;
    expect(Object.keys(keep).sort()).toEqual(['anki', 'assessments', 'notes', 'quizzes']);
    expect(report).toMatchObject({ removedNotes: 2, removedQuizzes: 1, removedCards: 5 });
    const partial = fakeDb();
    await target(partial.db, fakeStore().store).save(bundle, media, {
      notes: false,
      decks: false,
      tests: false,
    });
    expect(partial.order()).not.toContain('prune_content');
  });

  it('cards that moved or retired are counted from the changes after the last one it knew, page after page', async () => {
    const pages = [
      { changes: [{ deckId: '1' }, { deckId: null }], next: 11, more: true },
      { changes: [{ deckId: '2' }], next: 12, more: false },
    ];
    const { db, calls } = fakeDb({ anki_card_changes_since: () => pages.shift() });
    const report = await target(db, fakeStore().store).save(bundle, media);
    expect(calls.filter((c) => c.fn === 'anki_card_changes_since').map((c) => c.args)).toEqual([
      { since: 7, max_rows: 5000 },
      { since: 11, max_rows: 5000 },
    ]);
    expect(report).toMatchObject({ movedCards: 2, retiredCards: 1 });
  });

  it('when no card was sent nor removed, nothing is counted', async () => {
    const hashes = Object.fromEntries(bundle.ankiNotes.map((n) => [n.guid, n.hash]));
    const { db, order } = fakeDb({
      import_state: () => ({ notes: {}, quizzes: {}, ankiNotes: hashes, latestChange: 0 }),
    });
    await target(db, fakeStore().store).save(bundle, media);
    expect(order()).not.toContain('anki_card_changes_since');
  });

  describe('the browser indexes', () => {
    const stateWith = (indexes: Record<string, string> | undefined) => () => ({
      notes: {},
      quizzes: {},
      ankiNotes: {},
      latestChange: 0,
      ...(indexes ? { ankiBrowseIndexes: indexes } : {}),
    });

    it('an older database with no indexes gets none, and one with them already current gets nothing new', async () => {
      const old = fakeDb({ import_state: stateWith(undefined) });
      await target(old.db, fakeStore().store).save(bundle, media);
      expect(old.order()).not.toContain('save_anki_browse_indexes');
      const first = fakeDb({ import_state: stateWith({}) });
      const { store, puts } = fakeStore();
      await target(first.db, store).save(bundle, media);
      const written = first.calls.find((c) => c.fn === 'save_anki_browse_indexes')!.args.p as {
        items: { assessmentId: string; hash: string }[];
        remove: string[];
      };
      expect(written.items.map((i) => i.assessmentId)).toEqual(['anatomia-1/certamen-1']);
      expect(written.remove).toEqual([]);
      const known = Object.fromEntries(written.items.map((i) => [i.assessmentId, i.hash]));
      const current = fakeDb({ import_state: stateWith(known) });
      const second = fakeStore();
      const report = await target(current.db, second.store).save(bundle, media);
      expect(current.order()).not.toContain('save_anki_browse_indexes');
      expect(report).toMatchObject({ indexesUnchanged: 1, indexesWritten: 0 });
      expect(puts.some((p) => p.key.startsWith('browse/'))).toBe(true);
    });

    it('thumbnails go before their index file, the existing ones are counted and an index already in the store is skipped', async () => {
      const { db, calls } = fakeDb({ import_state: stateWith({ 'viejo/c1': 'abc' }) });
      const { store, puts } = fakeStore();
      const report = await target(db, store).save(bundle, media);
      const keys = puts.map((p) => p.key);
      const indexAt = keys.findIndex((k) => k.startsWith('browse/'));
      const thumbs = keys.filter((k) => k.startsWith('cards/thumb/'));
      expect(thumbs.length).toBeGreaterThan(0);
      expect(keys.slice(0, indexAt).filter((k) => k.startsWith('cards/thumb/'))).toEqual(thumbs);
      expect(puts[indexAt]!.type).toBe('application/json');
      expect(report).toMatchObject({
        thumbsUploaded: thumbs.length,
        indexesWritten: 1,
        indexesRemoved: 1,
      });
      const args = calls.find((c) => c.fn === 'save_anki_browse_indexes')!.args.p as {
        remove: string[];
      };
      expect(args.remove).toEqual(['viejo/c1']);

      const again = fakeDb({ import_state: stateWith({}) });
      const withIndex = fakeStore([keys[indexAt]!]);
      const r2 = await target(again.db, withIndex.store).save(bundle, media);
      expect(withIndex.puts.some((p) => p.key.startsWith('browse/'))).toBe(false);
      expect(r2.indexesWritten).toBe(1);

      const withThumbs = fakeStore(thumbs);
      const third = fakeDb({ import_state: stateWith({}) });
      const r3 = await target(third.db, withThumbs.store).save(bundle, media);
      expect(r3).toMatchObject({ thumbsExisting: thumbs.length, thumbsUploaded: 0 });
    });

    it('without a thumbnail maker of its own the thumbnails are made as small WebP images', async () => {
      const { db } = fakeDb({ import_state: stateWith({}) });
      const bodies: Buffer[] = [];
      const store = {
        has: () => Promise.resolve(false),
        put: (key: string, body: Buffer) => {
          if (key.startsWith('cards/thumb/')) bodies.push(body);
          return Promise.resolve();
        },
      };
      await new CloudTarget({ db: db, store }).save(bundle, media);
      expect(bodies.length).toBeGreaterThan(0);
      const { default: sharp } = await import('sharp');
      for (const body of bodies) {
        const meta = await sharp(body).metadata();
        expect(meta.format).toBe('webp');
        expect(meta.width).toBeLessThanOrEqual(240);
      }
    });

    it('with --assessment only its indexes are written or removed, and an index of another assessment stays', async () => {
      const { db, calls } = fakeDb({
        import_state: stateWith({ 'otro/c9': 'h', 'anatomia-1/certamen-1': 'viejo' }),
      });
      await target(db, fakeStore().store).save(bundle, media, {
        notes: false,
        decks: true,
        tests: false,
        assessments: ['anatomia-1/certamen-1'],
      });
      const p = calls.find((c) => c.fn === 'save_anki_browse_indexes')!.args.p as {
        items: unknown[];
        remove: string[];
      };
      expect(p.items).toHaveLength(1);
      expect(p.remove).toEqual([]);
    });

    it('a thumbnail whose image is nowhere stops the index before its file is written', async () => {
      const { db, calls } = fakeDb({ import_state: stateWith({}) });
      const { store, puts } = fakeStore();
      const thin = new Map([...media].filter(([k]) => !k.startsWith('cards/')));
      const error = await target(db, store)
        .save({ ...bundle, ankiNotes: bundle.ankiNotes.map((n) => ({ ...n, media: [] })) }, thin)
        .then(didNotFail, (e: unknown) => e as ImportError);
      expect(error.message).toMatch(/Falta la imagen cards\/.*miniatura/);
      expect(puts.some((p) => p.key.startsWith('browse/'))).toBe(false);
      expect(calls.some((c) => c.fn === 'save_anki_browse_indexes')).toBe(false);
    });
  });

  it('fromConfig builds the target with the real clients, which only connect when they are used', () => {
    const config = {
      contentUrl: 'https://content.example.test',
      contentServiceKey: 'key',
      r2AccountId: 'acct',
      r2AccessKeyId: 'id',
      r2SecretAccessKey: 'secret',
      r2Bucket: 'bucket',
    };
    expect(CloudTarget.fromConfig(config)).toBeInstanceOf(CloudTarget);
    expect(CloudTarget.fromConfig(config, 'draft')).toBeInstanceOf(CloudTarget);
  });
});
