// Plan step 1.4: the incremental importer, by assessment (20261107000000_incremental_import.sql + CloudTarget).
// The real CloudTarget against the content database with every migration, through a fake `rpc` that counts the
// calls, and a fake image store.
import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { CloudTarget } from '@qv/importer';
import type { ContentDatabase, MediaStore, SaveScope } from '@qv/importer';
import { ContentBundle } from '@qv/schema';
import {
  AN,
  BC,
  article,
  ankiNote,
  bundleOf,
  decksOf,
  everything,
  noteType,
  only,
  quiz,
} from './import-fixtures';
import type { Parts } from './import-fixtures';
import { asUser, createDatabase } from './pglite';

let db: PGlite;
let calls: { fn: string; args: Record<string, unknown> }[];
let stored: Map<string, Buffer>;
let storeCalls: number;

const rpcDb: ContentDatabase = {
  async rpc(fn, args) {
    calls.push({ fn, args });
    const names = Object.keys(args);
    const values = names.map((n) => {
      const v = args[n];
      return v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
    });
    const list = names
      .map((n, i) => {
        const v = args[n];
        return `${n} => $${i + 1}${v !== null && typeof v === 'object' ? '::jsonb' : ''}`;
      })
      .join(', ');
    try {
      const r = await db.transaction(async (tx) => {
        await tx.exec('set local role service_role');
        return tx.query<{ r: unknown }>(`select public.${fn}(${list}) as r`, values);
      });
      return { data: r.rows[0]!.r, error: null };
    } catch (e) {
      return { data: null, error: { message: (e as Error).message } };
    }
  },
};

const store: MediaStore = {
  async has(key) {
    storeCalls++;
    return stored.has(key);
  },
  async put(key, body) {
    storeCalls++;
    stored.set(key, body);
  },
};

const target = new CloudTarget({ db: rpcDb, store, maxBatchItems: 2 });

const FULL: SaveScope = { notes: true, decks: true, tests: true };
const save = (p: Parts, scope: SaveScope = FULL) => {
  const { bundle, media } = bundleOf(p);
  return target.save(bundle, media, scope);
};

/** Every published row, with its dates: to see that nothing of an assessment was touched. */
const snapshot = async () => {
  const q = async (sql: string) => (await db.query<Record<string, unknown>>(sql)).rows;
  return {
    notes: await q(
      'select id, assessment_id, hash, version, updated_at, version_at from notes order by id',
    ),
    quizzes: await q('select id, hash, updated_at from quizzes order by id'),
    questions: await q('select quiz_id, id, document from quiz_questions order by 1, 2'),
    ankiNotes: await q('select guid, hash, updated_at from anki_notes order by guid'),
    cards: await q('select note_guid, ord, deck_id from anki_cards order by 1, 2'),
    decks: await q('select id, parent, assessment_id from anki_decks order by id'),
    noteTypes: await q('select id from anki_note_types'),
    presets: await q('select name from anki_presets'),
  };
};
type Snapshot = Awaited<ReturnType<typeof snapshot>>;
const of = (s: Snapshot, assessmentId: string) => ({
  notes: s.notes.filter((n) => n.assessment_id === assessmentId),
  quizzes: s.quizzes.filter((q) => String(q.id).endsWith(assessmentId === BC ? 'bc' : 'an')),
  ankiNotes: s.ankiNotes.filter((n) =>
    String(n.guid).startsWith(assessmentId === BC ? 'bc' : 'an'),
  ),
});
/** now() is the transaction's: a small wait so that two saves do not share it. */
const tick = () => new Promise((r) => setTimeout(r, 15));

beforeEach(async () => {
  db = await createDatabase('content');
  calls = [];
  stored = new Map();
  storeCalls = 0;
});

describe('the incremental importer (step 1.4)', () => {
  it('a second import without changes makes ≤ 5 calls to the database and none to R2', async () => {
    const first = await save(everything());
    expect(first.changedNotes).toHaveLength(3);
    expect(first.changedCards).toHaveLength(4);
    expect(first.changedQuizzes).toHaveLength(2);
    expect(first.mediaUploaded).toBe(7);
    // In batches: at most 2 pieces per call here.
    expect(calls.filter((c) => c.fn === 'save_anki_notes')).toHaveLength(2);
    const before = await snapshot();
    await tick();

    calls = [];
    storeCalls = 0;
    const again = await save(everything());
    expect(calls.map((c) => c.fn)).toEqual([
      'import_state',
      'sync_catalog',
      'save_anki_catalog',
      'prune_content',
    ]);
    expect(calls.length).toBeLessThanOrEqual(5);
    expect(storeCalls).toBe(0);
    expect(again).toMatchObject({
      changedNotes: [],
      changedCards: [],
      changedQuizzes: [],
      removedNotes: 0,
      removedCards: 0,
      removedQuizzes: 0,
      movedCards: 0,
      retiredCards: 0,
      mediaUploaded: 0,
    });
    expect(again.unchangedNotes).toHaveLength(3);
    expect(await snapshot()).toEqual(before);
  });

  it('one article, one card and one question changed: only those are sent, and only that version goes up', async () => {
    await save(everything());
    const before = await snapshot();
    await tick();
    calls = [];
    storeCalls = 0;

    const p = everything();
    p.notes[1] = article('AP-BC-C2-09', BC, 'Procesamiento del RNA', 2);
    p.ankiNotes[1] = ankiNote('bc-2', BC, 'dos, corregida');
    p.quizzes[0] = quiz('practica-bc', BC, ['¿Uno?', '¿Dos, corregida?']);
    const r = await save(p);

    const sent = (fn: string) =>
      calls
        .filter((c) => c.fn === fn)
        .flatMap((c) => c.args.items as { id?: string; guid?: string }[])
        .map((x) => x.id ?? x.guid);
    expect(sent('save_notes')).toEqual(['AP-BC-C2-09']);
    expect(sent('save_anki_notes')).toEqual(['bc-2']);
    expect(sent('save_quizzes')).toEqual(['practica-bc']);
    expect(r).toMatchObject({
      changedNotes: ['AP-BC-C2-09'],
      changedCards: ['bc-2'],
      changedQuizzes: ['practica-bc'],
    });
    // Only the images of what changed are looked at (2 of the 7), and they were already there.
    expect(r).toMatchObject({ mediaUploaded: 0, mediaExisting: 2 });
    expect(storeCalls).toBe(2);

    const after = await snapshot();
    const version = (s: Snapshot, id: string) => s.notes.find((n) => n.id === id)!.version;
    expect(version(after, 'AP-BC-C2-09')).toBe(2);
    expect(version(after, 'AP-BC-C2-08')).toBe(1);
    expect(version(after, 'AP-A1-S3-01')).toBe(1);
    const others = <T extends { [k: string]: unknown }>(rows: T[], key: string, id: string) =>
      rows.filter((x) => x[key] !== id);
    expect(others(after.notes, 'id', 'AP-BC-C2-09')).toEqual(
      others(before.notes, 'id', 'AP-BC-C2-09'),
    );
    expect(others(after.ankiNotes, 'guid', 'bc-2')).toEqual(
      others(before.ankiNotes, 'guid', 'bc-2'),
    );
    expect(others(after.quizzes, 'id', 'practica-bc')).toEqual(
      others(before.quizzes, 'id', 'practica-bc'),
    );
    expect(after.ankiNotes.find((n) => n.guid === 'bc-2')!.updated_at).not.toEqual(
      before.ankiNotes.find((n) => n.guid === 'bc-2')!.updated_at,
    );
  });

  it('an article, a test and a deck that left the manifest go; the rest stays as it was', async () => {
    await save(everything());
    const before = await snapshot();
    const p = everything();
    p.notes = p.notes.filter((n) => n.id !== 'AP-BC-C2-08');
    p.quizzes = p.quizzes.filter((q) => q.id !== 'practica-an');
    p.ankiNotes = p.ankiNotes.filter((n) => n.guid !== 'an-1');
    p.assessments = [BC]; // Anatomía I C1 has no decks any more
    const r = await save(p);
    expect(r).toMatchObject({
      removedNotes: 1,
      removedQuizzes: 1,
      removedCards: 1,
      retiredCards: 1,
    });

    const after = await snapshot();
    expect(after.notes.map((n) => n.id)).toEqual(['AP-A1-S3-01', 'AP-BC-C2-09']);
    expect(after.quizzes.map((q) => q.id)).toEqual(['practica-bc']);
    expect(after.ankiNotes.map((n) => n.guid)).toEqual(['bc-1', 'bc-2', 'bc-3']);
    // Its decks go (the Anatomía I ones), and nothing of the other assessment changed.
    expect(after.decks.map((d) => d.id).sort()).toEqual(
      decksOf(BC)
        .map((d) => d.id)
        .sort(),
    );
    expect(of(after, BC).ankiNotes).toEqual(of(before, BC).ankiNotes);
    expect(after.questions.filter((q) => q.quiz_id === 'practica-bc')).toEqual(
      before.questions.filter((q) => q.quiz_id === 'practica-bc'),
    );
  });

  it('--assessment imports one assessment and never touches another, not even when removing', async () => {
    await save(everything());
    const before = await snapshot();
    await tick();
    calls = [];

    // Anatomía I C1 alone, without its article, its test and its card (as if they left its manifest), and
    // with nothing of Biología celular in the bundle.
    const p = only(everything(), AN);
    p.notes = [];
    p.quizzes = [];
    p.ankiNotes = [ankiNote('an-2', AN, 'cinco')];
    const r = await save(p, { ...FULL, assessments: [AN] });
    expect(calls[0]).toMatchObject({ fn: 'import_state', args: { assessments: [AN] } });
    expect(r).toMatchObject({ removedNotes: 1, removedQuizzes: 1, removedCards: 1 });

    const after = await snapshot();
    // Biología celular, row by row, dates included.
    expect(of(after, BC)).toEqual(of(before, BC));
    expect(after.questions.filter((q) => q.quiz_id === 'practica-bc')).toEqual(
      before.questions.filter((q) => q.quiz_id === 'practica-bc'),
    );
    expect(after.cards.filter((c) => String(c.note_guid).startsWith('bc'))).toEqual(
      before.cards.filter((c) => String(c.note_guid).startsWith('bc')),
    );
    // Its decks and the ones above both assessments stay; the note type and the preset too.
    expect(after.decks).toEqual(before.decks);
    expect(after.noteTypes).toEqual(before.noteTypes);
    expect(after.presets).toEqual(before.presets);
    // And Anatomía I C1 is what its bundle says.
    expect(of(after, AN)).toMatchObject({ notes: [], quizzes: [], ankiNotes: [{ guid: 'an-2' }] });

    // The same assessment again, without changes: the same few calls.
    calls = [];
    await save(p, { ...FULL, assessments: [AN] });
    expect(calls.map((c) => c.fn)).toEqual([
      'import_state',
      'sync_catalog',
      'save_anki_catalog',
      'prune_content',
    ]);
  });

  it('--assessment stops before writing if it would change a note type or a preset another assessment uses', async () => {
    await save(everything());
    const full = async () => ({
      noteTypes: (await db.query('select * from anki_note_types order by id')).rows,
      presets: (await db.query('select * from anki_presets order by name')).rows,
    });
    const before = { rows: await snapshot(), shared: await full() };
    const { bundle, media } = bundleOf(only(everything(), AN));
    const changed = ContentBundle.parse({
      ...bundle,
      ankiNoteTypes: [{ ...noteType, css: '.card { color: red }' }],
      ankiPresets: [{ name: 'Default', config: { new: { perDay: 5 } } }],
    });
    calls = [];
    storeCalls = 0;
    await expect(target.save(changed, media, { ...FULL, assessments: [AN] })).rejects.toThrow(
      /el tipo de nota «Cloze» \(lo usa biologia-celular\/certamen-2\); el preset «Default» \(lo usa biologia-celular\/certamen-2\)/,
    );
    expect(calls.map((c) => c.fn)).toEqual(['import_state']);
    expect(storeCalls).toBe(0);
    expect({ rows: await snapshot(), shared: await full() }).toEqual(before);

    // Everything together, it changes them (for every assessment, as it should).
    await target.save(
      ContentBundle.parse({
        ...bundleOf(everything()).bundle,
        ankiNoteTypes: changed.ankiNoteTypes,
      }),
      bundleOf(everything()).media,
    );
    expect((await full()).noteTypes).toMatchObject([{ css: '.card { color: red }' }]);
  });

  it('--assessment can change a note type or a preset only it uses', async () => {
    // Anatomía I C1 without cards: the note type is only Biología celular's (the preset, of the decks above).
    const p = everything();
    p.ankiNotes = p.ankiNotes.filter((n) => !n.guid.startsWith('an'));
    await save(p);
    const { bundle, media } = bundleOf(only(p, BC));
    await target.save(
      ContentBundle.parse({ ...bundle, ankiNoteTypes: [{ ...noteType, css: 'p { margin: 0 }' }] }),
      media,
      { ...FULL, assessments: [BC] },
    );
    expect((await db.query('select css from anki_note_types')).rows).toEqual([
      { css: 'p { margin: 0 }' },
    ]);
  });

  it('--only (some notes) does not remove the others', async () => {
    await save(everything());
    calls = [];
    const p = everything();
    const r = await save(
      { ...p, notes: [p.notes[0]!], quizzes: [], ankiNotes: [] },
      { notes: true, decks: false, tests: false, partialNotes: true },
    );
    expect(r.removedNotes).toBe(0);
    expect((await snapshot()).notes).toHaveLength(3);
    expect(calls.map((c) => c.fn)).not.toContain('prune_content');
  });

  it('the images reach the store before the pieces that use them are saved', async () => {
    // Every write, in order: the store's and the database's.
    const log: string[] = [];
    const logged = new CloudTarget({
      db: { rpc: (fn, args) => (log.push(fn), rpcDb.rpc(fn, args)) },
      store: {
        has: store.has,
        put: (key, body, type) => (log.push(key), store.put(key, body, type)),
      },
    });
    const { bundle, media } = bundleOf(everything());
    await logged.save(bundle, media);
    const lastImage = Math.max(...[...media.keys()].map((k) => log.indexOf(k)));
    const firstSave = log.findIndex((x) => x.startsWith('save_'));
    expect(lastImage).toBeGreaterThan(0);
    expect(lastImage).toBeLessThan(firstSave);

    // An image that cannot be uploaded: nothing is saved.
    db = await createDatabase('content');
    stored = new Map();
    calls = [];
    const failing = new CloudTarget({
      db: rpcDb,
      store: {
        has: async () => false,
        put: async () => {
          throw new Error('R2 no responde');
        },
      },
    });
    await expect(failing.save(bundle, media)).rejects.toThrow(/R2 no responde/);
    expect(calls.map((c) => c.fn)).toEqual(['import_state']);
    expect((await snapshot()).notes).toEqual([]);
  });

  it('a piece whose image is not in the package stops before writing anything', async () => {
    const { bundle, media } = bundleOf(everything());
    media.delete('notes/ap-bc-c2-08.webp');
    await expect(target.save(bundle, media)).rejects.toThrow(/Faltan 1 imágenes/);
    expect(calls.map((c) => c.fn)).toEqual(['import_state']);
    expect(storeCalls).toBe(0);
  });
});

describe('the functions of step 1.4', () => {
  const FUNCTIONS = [
    'import_state',
    'sync_catalog',
    'save_notes',
    'save_quizzes',
    'save_anki_notes',
    'prune_notes',
    'prune_content',
  ];

  it('run as their owner, with an empty search_path, and only service_role can call them', async () => {
    const r = await db.query<{
      proname: string;
      prosecdef: boolean;
      proconfig: string[] | null;
      anon: boolean;
      signed_in: boolean;
      service: boolean;
    }>(
      `select p.proname, p.prosecdef, p.proconfig,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as signed_in,
              has_function_privilege('service_role', p.oid, 'execute') as service
         from pg_proc p
        where p.pronamespace = 'public'::regnamespace and p.proname = any($1)
        order by 1`,
      [FUNCTIONS],
    );
    expect(r.rows.map((x) => x.proname)).toEqual([...FUNCTIONS].sort());
    for (const x of r.rows) {
      expect(x).toMatchObject({ prosecdef: true, anon: false, signed_in: false, service: true });
      expect(x.proconfig).toEqual(['search_path=""']);
    }
    await expect(
      asUser(db, { sub: '00000000-0000-4000-8000-00000000000a', email: 'ana@ug.uchile.cl' }, (tx) =>
        tx.query(`select public.prune_notes('[]'::jsonb, null)`),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('refuse a missing list or a forgotten scope instead of emptying the tables', async () => {
    await save(everything());
    for (const keep of [
      { notes: ['x'] },
      { assessments: null, quizzes: 'x' },
      { assessments: 'x' },
    ]) {
      const r = await rpcDb.rpc('prune_content', { keep });
      expect(r.error?.message).toMatch(/prune_content/);
    }
    expect(
      (await rpcDb.rpc('prune_notes', { keep: null, assessments: null })).error,
    ).not.toBeNull();
    expect((await snapshot()).notes).toHaveLength(3);
  });

  it('prune_notes removes only inside the assessments it is given', async () => {
    await save(everything());
    const r = await rpcDb.rpc('prune_notes', { keep: [], assessments: [AN] });
    expect(r.data).toBe(1);
    expect((await snapshot()).notes.map((n) => n.id)).toEqual(['AP-BC-C2-08', 'AP-BC-C2-09']);
  });

  it('the functions of before still work (the site and the importer in production)', async () => {
    await save(everything());
    const r = await rpcDb.rpc('prune_quizzes', { keep: ['practica-bc'] });
    expect(r).toEqual({ data: 1, error: null });
    const n = article('AP-BC-C2-10', BC, 'Núcleo', 3);
    const { updatedAt: _u, media: _m, ...record } = n;
    expect((await rpcDb.rpc('save_note', { n: record })).data).toBe(true);
  });
});
