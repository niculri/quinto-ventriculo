// Plan step 1.5: take a piece off the site in minutes (20261108000000_unpublish.sql + `npm run unpublish`).
// The real command and the real importer against the content database with every migration (PGlite), with a fake R2,
// and the users' database next to it to see that every student's progress stays and comes back.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CloudTarget, readUnpublished, restore, unpublish, withoutUnpublished } from '@qv/importer';
import type {
  ContentDatabase,
  Manifest,
  MediaRemover,
  MediaStore,
  UnpublishOptions,
} from '@qv/importer';
import { ContentBundle } from '@qv/schema';
import {
  AN,
  BC,
  ROOT,
  ankiNote,
  article,
  bundleOf,
  decksOf,
  everything,
  leafOf,
  serviceRpc,
  withHash,
} from './import-fixtures';
import type { Parts } from './import-fixtures';
import { asUser, createDatabase } from './pglite';

let db: PGlite;
let users: PGlite;
const calls: { fn: string; args: Record<string, unknown> }[] = [];
const stored = new Map<string, Buffer>();
const storeCalls: string[] = [];
let folder: string;
let listFile: string;

const rpc = serviceRpc(() => db, calls);

const store: MediaStore & MediaRemover = {
  async has(key) {
    storeCalls.push(`has ${key}`);
    return stored.has(key);
  },
  async put(key, body) {
    storeCalls.push(`put ${key}`);
    stored.set(key, body);
  },
  async delete(key) {
    storeCalls.push(`delete ${key}`);
    stored.delete(key);
  },
};
const target = new CloudTarget({ db: rpc, store });

/** What the command knows of the manifest: the articles (id, web code, slug) and the tests. */
const manifest = (p: Parts): Pick<Manifest, 'notes' | 'tests'> =>
  ({
    notes: [BC, AN].map((assessmentId) => ({
      assessmentId,
      notes: p.notes
        .filter((n) => n.assessmentId === assessmentId)
        .map((n) => ({ id: n.id, code: n.code, slug: n.slug })),
    })),
    tests: [BC, AN].map((assessmentId) => ({
      assessmentId,
      tests: p.quizzes
        .filter((q) => q.assessmentId === assessmentId)
        .map((q) => ({ id: q.id, slug: q.slug })),
    })),
  }) as unknown as Pick<Manifest, 'notes' | 'tests'>;

const run = (p: Parts, o: Partial<UnpublishOptions> & Pick<UnpublishOptions, 'kind' | 'id'>) =>
  unpublish({
    db: rpc,
    store,
    listFile,
    manifest: manifest(p),
    reason: 'Error grave en la figura 3',
    by: 'dueño',
    confirm: async () => true,
    now: () => new Date('2026-11-08T12:00:00Z'),
    ...o,
  });

/** The importer as `npm run import` runs it: the bundle without what content/unpublished.json lists. */
const importAll = async (p: Parts) => {
  const { bundle, media } = bundleOf(p);
  const off = withoutUnpublished(bundle, media, await readUnpublished(listFile));
  calls.length = 0;
  storeCalls.length = 0;
  const report = await target.save(off.bundle, off.media);
  return { report, skipped: off.skipped };
};

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows;
/** Every published row, with its dates: to see that nothing of another piece changed. */
const snapshot = async () => ({
  notes: await q(
    'select id, hash, version, updated_at, published_at, version_at from notes order by id',
  ),
  sections: await q('select note_id, position, body from note_sections order by 1, 2'),
  quizzes: await q('select id, hash, updated_at from quizzes order by id'),
  questions: await q('select quiz_id, id, document from quiz_questions order by 1, 2'),
  ankiNotes: await q('select guid, hash, updated_at from anki_notes order by guid'),
  cards: await q('select note_guid, ord, deck_id, front_html from anki_cards order by 1, 2'),
  decks: await q('select id, parent, assessment_id from anki_decks order by id'),
});
type Snapshot = Awaited<ReturnType<typeof snapshot>>;
const withoutRows = (
  s: Snapshot,
  drop: (table: keyof Snapshot, row: Record<string, unknown>) => boolean,
) =>
  Object.fromEntries(
    Object.entries(s).map(([t, rows]) => [t, rows.filter((r) => !drop(t as keyof Snapshot, r))]),
  );

/** What the API reads, by function (the articles it reads from the table, as PostgREST). */
const apiReads = async () => ({
  notes: (await q<{ slug: string }>('select slug from notes order by slug')).map((r) => r.slug),
  search: (
    await q<{ note_id: string }>(`select note_id from public.search_notes('transcripción', 50)`)
  ).map((r) => r.note_id),
  quiz: (await q<{ r: unknown }>(`select public.quiz_detail('practica-bc') as r`))[0]!.r,
  section: (await q<{ r: unknown }>(`select public.quiz_section('practica-bc', 'all') as r`))[0]!.r,
  tree: await q<{ id: string; card_count: number }>(
    'select id, card_count from public.anki_deck_tree() order by id',
  ),
  deck: (await q<{ r: unknown }>(`select public.anki_deck_detail($1) as r`, [leafOf(BC)]))[0]!.r,
  browse: JSON.stringify((await q<{ r: unknown }>('select public.anki_browse_notes() as r'))[0]!.r),
  card: (await q<{ r: unknown }>(`select public.anki_card('bc-1', 0) as r`))[0]!.r,
});

beforeEach(async () => {
  db = await createDatabase('content');
  calls.length = 0;
  stored.clear();
  storeCalls.length = 0;
  folder = await mkdtemp(join(tmpdir(), 'qv-unpublish-'));
  listFile = join(folder, 'unpublished.json');
  await writeFile(listFile, '{\n  "items": []\n}\n');
  await importAll(everything());
});
afterEach(() => rm(folder, { recursive: true, force: true }));

describe('the command (npm run unpublish)', () => {
  it('--dry-run only says what would go: one call, nothing written, no list entry', async () => {
    const before = await snapshot();
    calls.length = 0;
    const out = await run(everything(), { kind: 'note', id: 'QV-BC-C2-08', dryRun: true });
    expect(out.applied).toBe(false);
    expect(out.result).toMatchObject({
      kind: 'note',
      id: 'AP-BC-C2-08',
      found: true,
      title: 'Clase 1',
      assessmentId: BC,
      removed: { notes: 1, sections: 1 },
      logId: null,
    });
    expect(out.calls).toEqual({ db: 1, store: 0 });
    expect(calls.map((c) => c.fn)).toEqual(['unpublish_content']);
    expect(await snapshot()).toEqual(before);
    expect(await readUnpublished(listFile)).toEqual([]);
    expect(await q('select * from unpublish_log')).toEqual([]);
  });

  it('not confirmed: one call, nothing taken off and nothing in the list', async () => {
    const before = await snapshot();
    let asked = '';
    const out = await run(everything(), {
      kind: 'quiz',
      id: 'practica-bc',
      confirm: async (summary) => {
        asked = summary;
        return false;
      },
    });
    expect(asked).toContain('1 test con 2 preguntas');
    expect(out).toMatchObject({ applied: false, calls: { db: 1, store: 0 } });
    expect(await snapshot()).toEqual(before);
    expect(await readUnpublished(listFile)).toEqual([]);
  });

  it('an article, by its web code: two calls; the list first, then out of every read, with its record', async () => {
    const before = await snapshot();
    const readsBefore = await apiReads();
    calls.length = 0;
    const out = await run(everything(), { kind: 'note', id: 'QV-BC-C2-08' });
    expect(out).toMatchObject({ applied: true, calls: { db: 2, store: 0 } });
    expect(calls.map((c) => [c.fn, c.args.apply])).toEqual([
      ['unpublish_content', false],
      ['unpublish_content', true],
    ]);
    expect(await readUnpublished(listFile)).toEqual([
      {
        kind: 'note',
        id: 'AP-BC-C2-08',
        reason: 'Error grave en la figura 3',
        date: '2026-11-08',
        by: 'dueño',
      },
    ]);
    const reads = await apiReads();
    expect(reads.notes).toEqual(readsBefore.notes.filter((s) => s !== 'clase-ap-bc-c2-08'));
    expect(readsBefore.search).toContain('AP-BC-C2-08');
    expect(reads.search).not.toContain('AP-BC-C2-08');
    // Nothing else changed: the other articles, the tests and the decks, row by row with their dates.
    expect(await snapshot()).toEqual(
      withoutRows(
        before,
        (t, r) =>
          (t === 'notes' && r.id === 'AP-BC-C2-08') ||
          (t === 'sections' && r.note_id === 'AP-BC-C2-08'),
      ),
    );
    const [log] = await q(
      'select kind, item_id, title, reason, requested_by, removed from unpublish_log',
    );
    expect(log).toEqual({
      kind: 'note',
      item_id: 'AP-BC-C2-08',
      title: 'Clase 1',
      reason: 'Error grave en la figura 3',
      requested_by: 'dueño',
      removed: { notes: 1, sections: 1, usedBy: [] },
    });
  });

  it('a test: out of the API, and the import that follows does not publish it again', async () => {
    const before = await snapshot();
    await run(everything(), { kind: 'quiz', id: 'practica-bc' });
    const reads = await apiReads();
    expect(reads.quiz).toBeNull();
    expect(reads.section).toBeNull();
    expect(await snapshot()).toEqual(
      withoutRows(
        before,
        (t, r) =>
          (t === 'quizzes' && r.id === 'practica-bc') ||
          (t === 'questions' && r.quiz_id === 'practica-bc'),
      ),
    );
    const { report, skipped } = await importAll(everything());
    expect(skipped).toEqual([
      { kind: 'quiz', id: 'practica-bc', what: '«Práctica» (2 preguntas)' },
    ]);
    expect(report.changedQuizzes).toEqual([]);
    expect(report.removedQuizzes).toBe(0);
    expect(calls.length).toBeLessThanOrEqual(5);
    expect(storeCalls).toEqual([]);
    expect((await apiReads()).quiz).toBeNull();
  });

  it('a deck with every deck below it: its cards leave (recorded as taken out), the other assessment stays', async () => {
    const before = await snapshot();
    const latest = (
      await q<{ r: { latest: number } }>(`select public.anki_card_changes_since(0, 10) as r`)
    )[0]!.r.latest;
    // By its full name: the database says its id.
    const assessmentDeck = decksOf(BC).at(-2)!;
    const out = await run(everything(), { kind: 'deck', id: assessmentDeck.name });
    expect(out.result).toMatchObject({
      id: assessmentDeck.id,
      found: true,
      removed: { decks: 2, ankiNotes: 3, cards: 3, staleNotes: 0 },
    });
    expect((await readUnpublished(listFile))[0]).toMatchObject({
      kind: 'deck',
      id: assessmentDeck.id,
    });
    const reads = await apiReads();
    expect(reads.deck).toBeNull();
    expect(reads.card).toBeNull();
    expect(reads.tree.map((d) => d.id)).not.toContain(leafOf(BC));
    expect(reads.browse).not.toContain('bc-1');
    const changes = (
      await q<{ r: { changes: { noteGuid: string; deckId: string | null }[] } }>(
        `select public.anki_card_changes_since($1, 100) as r`,
        [latest],
      )
    )[0]!.r.changes;
    expect(changes).toEqual([
      { noteGuid: 'bc-1', ord: 0, deckId: null },
      { noteGuid: 'bc-2', ord: 0, deckId: null },
      { noteGuid: 'bc-3', ord: 0, deckId: null },
    ]);
    const bcDecks = new Set(
      decksOf(BC)
        .slice(3)
        .map((d) => d.id),
    );
    expect(await snapshot()).toEqual(
      withoutRows(
        before,
        (t, r) =>
          (t === 'ankiNotes' && String(r.guid).startsWith('bc')) ||
          (t === 'cards' && String(r.note_guid).startsWith('bc')) ||
          (t === 'decks' && bcDecks.has(String(r.id))),
      ),
    );
  });

  it('a deck above an assessment (root, semester, course) is refused without --above-assessment, and says which assessments it takes', async () => {
    const before = await snapshot();
    const lines: string[] = [];
    // The dry run shows it, with the assessments, and does not refuse.
    const dry = await run(everything(), {
      kind: 'deck',
      id: ROOT,
      dryRun: true,
      log: (l) => lines.push(l),
    });
    expect(dry.applied).toBe(false);
    expect(dry.result.removed.assessments).toEqual([AN, BC].sort());
    expect(lines.join('\n')).toMatch(/2 evaluaciones: /);
    expect(lines.join('\n')).toMatch(/--above-assessment/);
    // Without the option, nothing changes: not the database, not the list.
    for (const deck of [ROOT, decksOf(BC)[1]!.id, decksOf(BC)[2]!.id]) {
      await expect(run(everything(), { kind: 'deck', id: deck })).rejects.toThrow(
        /está sobre las evaluaciones.*--above-assessment/s,
      );
    }
    expect(await readUnpublished(listFile)).toEqual([]);
    expect(await snapshot()).toEqual(before);
    // The course deck of Biología celular takes only its assessment.
    await expect(run(everything(), { kind: 'deck', id: decksOf(BC)[2]!.id })).rejects.toThrow(
      new RegExp(`la evaluación ${BC}`),
    );
    // With it, it goes.
    const out = await run(everything(), { kind: 'deck', id: ROOT, aboveAssessment: true });
    expect(out.applied).toBe(true);
    expect(out.result.removed).toMatchObject({ assessments: [AN, BC].sort() });
    expect((await apiReads()).tree).toEqual([]);
  });

  it('a deck of an assessment does not need the option', async () => {
    const out = await run(everything(), { kind: 'deck', id: decksOf(AN).at(-2)!.id });
    expect(out.applied).toBe(true);
    expect(out.result.removed.assessments).toEqual([AN]);
  });

  it('an article that is not published yet but is in the manifest goes to the list; a wrong id is an error', async () => {
    const p = everything();
    p.notes.push(article('AP-BC-C2-10', BC, 'Núcleo', 3));
    const out = await run(p, { kind: 'note', id: 'AP-BC-C2-10' });
    expect(out.result.found).toBe(false);
    expect(out.applied).toBe(true);
    expect((await readUnpublished(listFile)).map((i) => i.id)).toEqual(['AP-BC-C2-10']);
    expect((await importAll(p)).report.changedNotes).toEqual([]);
    await expect(run(p, { kind: 'note', id: 'AP-BC-C2-99' })).rejects.toThrow(
      /No existe el artículo/,
    );
    await expect(run(p, { kind: 'deck', id: '999' })).rejects.toThrow(/No existe el mazo/);
    await expect(run(p, { kind: 'note', id: 'AP-BC-C2-09', reason: ' ' })).rejects.toThrow(
      /Falta el motivo/,
    );
  });

  it('twice: the second time it says so and changes nothing', async () => {
    await run(everything(), { kind: 'quiz', id: 'practica-bc' });
    const before = await snapshot();
    const lines: string[] = [];
    const out = await run(everything(), {
      kind: 'quiz',
      id: 'practica-bc',
      log: (l) => lines.push(l),
    });
    expect(out).toMatchObject({ applied: false, alreadyListed: true });
    expect(lines.join('\n')).toMatch(/ya estaba fuera del sitio/);
    expect(await snapshot()).toEqual(before);
    expect(await readUnpublished(listFile)).toHaveLength(1);
  });

  it('the list goes first: if taking it off fails, it is already in the list and nothing else changed; the same command finishes it', async () => {
    const before = await snapshot();
    const failing: ContentDatabase = {
      rpc: (fn, args) =>
        args.apply
          ? Promise.resolve({ data: null, error: { message: 'canceling statement' } })
          : rpc.rpc(fn, args),
    };
    await expect(
      run(everything(), { kind: 'quiz', id: 'practica-bc', db: failing }),
    ).rejects.toThrow(/canceling statement/);
    expect((await readUnpublished(listFile)).map((i) => i.id)).toEqual(['practica-bc']);
    expect(await snapshot()).toEqual(before);
    const out = await run(everything(), { kind: 'quiz', id: 'practica-bc' });
    expect(out).toMatchObject({ applied: true, alreadyListed: true, calls: { db: 2, store: 0 } });
    expect(await readUnpublished(listFile)).toHaveLength(1);
    expect((await apiReads()).quiz).toBeNull();
  });

  it('--restore with --dry-run says what it would take out of the list and writes nothing', async () => {
    await run(everything(), { kind: 'note', id: 'AP-BC-C2-08' });
    const text = await readFile(listFile, 'utf8');
    expect(
      await restore(listFile, manifest(everything()), 'note', 'QV-BC-C2-08', { dryRun: true }),
    ).toMatchObject({ kind: 'note', id: 'AP-BC-C2-08' });
    expect(await readFile(listFile, 'utf8')).toBe(text);
  });
});

describe('publishing it again: out of the list, and import', () => {
  it('an article comes back with its version and its dates; changed, with the next version', async () => {
    const p = everything();
    p.notes[0] = article('AP-BC-C2-08', BC, 'Transcripción, corregida', 1);
    await importAll(p);
    const [v2] = await q('select version, published_at, version_at from notes where id = $1', [
      'AP-BC-C2-08',
    ]);
    expect(v2!.version).toBe(2);
    await run(p, { kind: 'note', id: 'AP-BC-C2-08' });
    expect((await importAll(p)).skipped).toHaveLength(1);
    expect(await q('select id from notes where id = $1', ['AP-BC-C2-08'])).toEqual([]);

    expect(await restore(listFile, manifest(p), 'note', 'QV-BC-C2-08')).toMatchObject({
      id: 'AP-BC-C2-08',
    });
    expect(await readUnpublished(listFile)).toEqual([]);
    const { report } = await importAll(p);
    expect(report.changedNotes).toEqual(['AP-BC-C2-08']);
    expect(
      await q('select version, published_at, version_at from notes where id = $1', ['AP-BC-C2-08']),
    ).toEqual([v2]);
    expect((await apiReads()).search).toContain('AP-BC-C2-08');

    // Taken off again and back with another text: the next version, «Creado el» the same.
    await run(p, { kind: 'note', id: 'AP-BC-C2-08' });
    await restore(listFile, manifest(p), 'note', 'AP-BC-C2-08');
    p.notes[0] = article('AP-BC-C2-08', BC, 'Transcripción, otra vez', 1);
    await importAll(p);
    const [v3] = await q<{ version: number; published_at: string }>(
      'select version, published_at from notes where id = $1',
      ['AP-BC-C2-08'],
    );
    expect(v3).toEqual({ version: 3, published_at: v2!.published_at });
    expect(await q('select * from unpublished_note_versions')).toEqual([]);
  });

  it('a deck comes back with the same cards: the changes say so (each student shows them again)', async () => {
    await run(everything(), { kind: 'deck', id: leafOf(BC) });
    const latest = (
      await q<{ r: { latest: number } }>(`select public.anki_card_changes_since(0, 10) as r`)
    )[0]!.r.latest;
    await restore(listFile, manifest(everything()), 'deck', leafOf(BC));
    const { report } = await importAll(everything());
    expect(report.changedCards.sort()).toEqual(['bc-1', 'bc-2', 'bc-3']);
    expect(report.movedCards).toBe(3);
    const changes = (
      await q<{ r: { changes: { noteGuid: string; deckId: string | null }[] } }>(
        `select public.anki_card_changes_since($1, 100) as r`,
        [latest],
      )
    )[0]!.r.changes;
    expect(changes.map((c) => [c.noteGuid, c.deckId])).toEqual([
      ['bc-1', leafOf(BC)],
      ['bc-2', leafOf(BC)],
      ['bc-3', leafOf(BC)],
    ]);
    expect((await apiReads()).card).not.toBeNull();
  });

  it('a note with cards in the deck and in another one stays with those, and is sent again when the deck comes back', async () => {
    const p = everything();
    const mix = withHash({
      ...(({ hash: _h, updatedAt: _u, ...rest }) => rest)(ankiNote('mix', BC, 'mezcla')),
      cards: [
        { ord: 0, deckId: leafOf(BC), frontHtml: '<p>a</p>', backHtml: '<p>a</p>', sortField: 'a' },
        {
          ord: 1,
          deckId: decksOf(BC).at(-2)!.id,
          frontHtml: '<p>b</p>',
          backHtml: '<p>b</p>',
          sortField: 'b',
        },
      ],
    });
    p.ankiNotes.push({ ...mix, updatedAt: '2026-11-06T12:00:00.000Z' });
    await importAll(p);
    const out = await run(p, { kind: 'deck', id: leafOf(BC) });
    expect(out.result.removed).toMatchObject({ decks: 1, ankiNotes: 3, cards: 4, staleNotes: 1 });
    expect(await q(`select ord, deck_id from anki_cards where note_guid = 'mix'`)).toEqual([
      { ord: 1, deck_id: decksOf(BC).at(-2)!.id },
    ]);
    // With the deck in the list, the import sends it without that card (another hash), and nothing else.
    const off = await importAll(p);
    expect(off.report.changedCards).toEqual(['mix']);
    expect(await q(`select ord from anki_cards where note_guid = 'mix'`)).toEqual([{ ord: 1 }]);
    await restore(listFile, manifest(p), 'deck', leafOf(BC));
    const back = await importAll(p);
    expect(back.report.changedCards.sort()).toEqual(['bc-1', 'bc-2', 'bc-3', 'mix']);
    expect(await q(`select ord from anki_cards where note_guid = 'mix' order by ord`)).toEqual([
      { ord: 0 },
      { ord: 1 },
    ]);
  });

  it('a deck that comes back right after the command (no import in between): a note that kept cards in another deck gets its card back', async () => {
    const p = everything();
    const base = (({ hash: _h, updatedAt: _u, ...rest }) => rest)(ankiNote('mix', BC, 'mezcla'));
    p.ankiNotes.push({
      ...withHash({
        ...base,
        cards: [
          { ...base.cards[0]!, ord: 0 },
          { ...base.cards[0]!, ord: 1, deckId: decksOf(BC).at(-2)!.id },
        ],
      }),
      updatedAt: '2026-11-06T12:00:00.000Z',
    });
    await importAll(p);
    await run(p, { kind: 'deck', id: leafOf(BC) });
    // Its hash is marked: the note as the manifest has it is not what is published any more.
    expect(await q(`select hash from anki_notes where guid = 'mix'`)).toEqual([
      { hash: 'unpublished' },
    ]);
    await restore(listFile, manifest(p), 'deck', leafOf(BC));
    const back = await importAll(p);
    expect(back.report.changedCards.sort()).toEqual(['bc-1', 'bc-2', 'bc-3', 'mix']);
    expect(
      await q(`select ord, deck_id from anki_cards where note_guid = 'mix' order by ord`),
    ).toEqual([
      { ord: 0, deck_id: leafOf(BC) },
      { ord: 1, deck_id: decksOf(BC).at(-2)!.id },
    ]);
  });

  it('a test comes back with the same question ids', async () => {
    const ids = async () =>
      (
        await q<{ id: string }>(
          `select id from quiz_questions where quiz_id = 'practica-bc' order by position`,
        )
      ).map((r) => r.id);
    const before = await ids();
    await run(everything(), { kind: 'quiz', id: 'practica-bc' });
    await restore(listFile, manifest(everything()), 'quiz', 'practica-bc');
    expect((await importAll(everything())).report.changedQuizzes).toEqual(['practica-bc']);
    expect(await ids()).toEqual(before);
  });
});

describe('an image', () => {
  const KEY = 'cards/0123456789abcdef0123456789abcdef.webp';
  const withImage = (): Parts => {
    const p = everything();
    const base = (({ hash: _h, updatedAt: _u, ...rest }) => rest)(ankiNote('img', BC, 'lámina'));
    p.ankiNotes.push({
      ...withHash({
        ...base,
        cards: [{ ...base.cards[0]!, frontHtml: `<img data-media="${KEY}">` }],
        media: [KEY],
      }),
      updatedAt: '2026-11-06T12:00:00.000Z',
    });
    return p;
  };

  it('deleted from R2 (404); the pieces that use it are named and the import refuses them until it is replaced', async () => {
    const p = withImage();
    await importAll(p);
    expect(stored.has(KEY)).toBe(true);
    const before = await snapshot();
    calls.length = 0;
    const dry = await run(p, { kind: 'image', id: KEY, dryRun: true });
    expect(dry.calls).toEqual({ db: 1, store: 1 });
    expect(dry.result.usedBy).toEqual([{ kind: 'ankiNote', id: 'img', title: 'img' }]);
    expect(stored.has(KEY)).toBe(true);

    storeCalls.length = 0;
    const out = await run(p, { kind: 'image', id: KEY });
    // The image, and whether it has a thumbnail of the card browser (step 3.3; this note is not an occlusion: none).
    expect(out.calls).toEqual({ db: 2, store: 3 });
    expect(storeCalls).toEqual([
      `has ${KEY}`,
      `delete ${KEY}`,
      'has cards/thumb/0123456789abcdef0123456789abcdef.webp',
    ]);
    expect(stored.has(KEY)).toBe(false);
    // Only its hash is marked (so that it is sent again with its images); the card is still published.
    expect(await snapshot()).toEqual({
      ...before,
      ankiNotes: before.ankiNotes.map((r) =>
        r.guid === 'img' ? { ...r, hash: 'unpublished' } : r,
      ),
    });
    await expect(importAll(p)).rejects.toThrow(
      /la imagen cards\/0123456789abcdef0123456789abcdef\.webp está en content\/unpublished\.json y la usa nota de Anki img/,
    );
    // Back in the list's hands: out of it, the import sends that note again and uploads the image.
    await restore(listFile, manifest(p), 'image', KEY);
    const back = await importAll(p);
    expect(back.report.changedCards).toEqual(['img']);
    expect(storeCalls).toEqual([`has ${KEY}`, `put ${KEY}`]);
  });
});

describe('every student’s progress', () => {
  const ANA = { sub: '00000000-0000-4000-8000-00000000000a', email: 'ana@ug.uchile.cl' };
  const call = (fn: string, n: number) =>
    `select public.${fn}(${Array.from({ length: n }, (_, i) => `$${i + 1}`).join(', ')}) as r`;
  const answer = (noteGuid: string, deckId: string) => {
    const now = new Date();
    return {
      noteGuid,
      ord: 0,
      deckId,
      expectedUpdatedAt: null,
      rating: 3,
      queueBefore: 'new',
      interval: -600,
      lastInterval: 0,
      durationMs: 4200,
      state: {
        phase: 'learning',
        interday: false,
        remainingSteps: 1,
        due: new Date(now.getTime() + 600_000).toISOString(),
        interval: 0,
        stability: 2.3065,
        difficulty: 2.118,
        reps: 1,
        lapses: 0,
        lastReview: now.toISOString(),
        suspended: false,
        leech: false,
      },
      bury: [],
      buriedUntil: null,
    };
  };
  const ROUND = '11111111-1111-4111-8111-111111111111';
  const usersSnapshot = async () => ({
    cards: (await users.query('select * from public.card_states order by note_guid')).rows,
    quizzes: (await users.query('select * from public.quiz_progress')).rows,
    rounds: (await users.query('select * from public.quiz_rounds')).rows,
    answers: (await users.query('select * from public.quiz_answers')).rows,
  });
  /** What the web does on entering: the content's changes since its cursor, to reconcile_cards(). */
  const enter = async () => {
    const [sync] = (
      await asUser(users, ANA, (tx) =>
        tx.query<{ synced_to: number | null }>('select synced_to from public.card_sync'),
      )
    ).rows;
    const since = Number(sync?.synced_to ?? 0);
    const page = (
      await q<{ r: { changes: unknown[]; next: number } }>(
        `select public.anki_card_changes_since($1, 2000) as r`,
        [since],
      )
    )[0]!.r;
    await asUser(users, ANA, (tx) =>
      tx.query(call('reconcile_cards', 1), [{ since, upTo: page.next, changes: page.changes }]),
    );
  };
  const card = async () =>
    (
      await asUser(users, ANA, (tx) =>
        tx.query<{ deck_id: string; reps: number; phase: string; retired_at: string | null }>(
          `select deck_id, reps, phase, retired_at from public.card_states where note_guid = 'bc-1'`,
        ),
      )
    ).rows[0];

  beforeEach(async () => {
    users = await createDatabase('users');
    await users.query('update public.access_settings set open_to_domain = true');
    await users.query('insert into auth.users (id, email) values ($1, $2)', [ANA.sub, ANA.email]);
    await enter();
    await asUser(users, ANA, (tx) =>
      tx.query(call('record_review', 1), [answer('bc-1', leafOf(BC))]),
    );
    await asUser(users, ANA, (tx) =>
      tx.query(call('save_quiz_progress', 1), [
        {
          quizId: 'practica-bc',
          sectionId: 'all',
          preferences: { groups: ['01'], shuffle: false, shuffleOptions: false },
          round: {
            version: 1,
            id: ROUND,
            queue: ['practica-bc-q1', 'practica-bc-q2'],
            index: 1,
            top: 1,
            shuffled: false,
            shuffleOptions: false,
            orders: [null, null],
            answers: [{ position: 0, questionId: 'practica-bc-q1', chosen: 0, correct: true }],
            screen: 'question',
            finished: false,
            startedAt: '2026-11-08T12:00:00.000Z',
          },
          roundInfo: {
            id: ROUND,
            origin: 'cover',
            questionCount: 2,
            shuffled: false,
            shuffleOptions: false,
            startedAt: '2026-11-08T12:00:00.000Z',
            finished: false,
          },
          answer: {
            roundId: ROUND,
            questionId: 'practica-bc-q1',
            position: 0,
            chosen: 0,
            correct: true,
            answeredAt: '2026-11-08T12:00:05Z',
          },
        },
      ]),
    );
  });

  it('nothing is written in the users’ database; the deck’s cards hide on entering and come back where they were', async () => {
    const before = await usersSnapshot();
    const answered = await card();
    expect(answered).toMatchObject({ deck_id: leafOf(BC), reps: 1, retired_at: null });

    await run(everything(), { kind: 'deck', id: leafOf(BC) });
    await run(everything(), { kind: 'quiz', id: 'practica-bc' });
    // The command and the import only talk to the content database.
    expect(await usersSnapshot()).toEqual(before);

    await enter();
    const hidden = await card();
    expect(hidden).toMatchObject({ deck_id: leafOf(BC), reps: 1, phase: 'learning' });
    expect(hidden!.retired_at).not.toBeNull();

    await restore(listFile, manifest(everything()), 'deck', leafOf(BC));
    await restore(listFile, manifest(everything()), 'quiz', 'practica-bc');
    await importAll(everything());
    await enter();
    expect(await card()).toEqual(answered);
    // The test's round and answers never changed, and its questions are there again with the same ids.
    const after = await usersSnapshot();
    expect({ ...after, cards: [] }).toEqual({ ...before, cards: [] });
    const section = (
      await q<{ r: { groups: { questions: { id: string }[] }[] } }>(
        `select public.quiz_section('practica-bc', 'all') as r`,
      )
    )[0]!.r;
    expect(section.groups.flatMap((g) => g.questions.map((x) => x.id))).toEqual([
      'practica-bc-q1',
      'practica-bc-q2',
    ]);
  });
});

describe('the database side', () => {
  it('unpublish_content runs as its owner, with an empty search_path, and only service_role can call it', async () => {
    const [f] = await q<{
      prosecdef: boolean;
      proconfig: string[];
      anon: boolean;
      signed_in: boolean;
      service: boolean;
    }>(
      `select p.prosecdef, p.proconfig,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as signed_in,
              has_function_privilege('service_role', p.oid, 'execute') as service
         from pg_proc p where p.proname = 'unpublish_content'`,
    );
    expect(f).toEqual({
      prosecdef: true,
      proconfig: ['search_path=""'],
      anon: false,
      signed_in: false,
      service: true,
    });
    await expect(
      asUser(db, { sub: '00000000-0000-4000-8000-00000000000a', email: 'ana@ug.uchile.cl' }, (tx) =>
        tx.query(`select public.unpublish_content('note', 'AP-BC-C2-08', 'x', 'y', true)`),
      ),
    ).rejects.toThrow(/permission denied/);
    // The record and the kept versions: nobody reads or writes them but the function (and the owner, in the editor).
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const [r] = await q<{ log: boolean; versions: boolean; sequence: boolean }>(
        `select has_table_privilege($1, 'public.unpublish_log', 'select') as log,
                has_table_privilege($1, 'public.unpublished_note_versions', 'select') as versions,
                has_sequence_privilege($1, 'public.unpublish_log_id_seq', 'usage, select, update')
                  as sequence`,
        [role],
      );
      expect(r).toEqual({ log: false, versions: false, sequence: false });
    }
  });

  it('refuses taking off without a reason or who asked, and an unknown kind', async () => {
    const r = (sql: string) =>
      rpc.rpc('unpublish_content', JSON.parse(sql) as Record<string, unknown>);
    expect(
      (await r('{"kind":"note","item":"AP-BC-C2-08","reason":" ","requested_by":"x","apply":true}'))
        .error?.message,
    ).toMatch(/needs a reason/);
    expect(
      (
        await r(
          '{"kind":"note","item":"AP-BC-C2-08","reason":"x","requested_by":null,"apply":true}',
        )
      ).error?.message,
    ).toMatch(/who asked/);
    expect((await r('{"kind":"page","item":"x","apply":false}')).error?.message).toMatch(
      /kind has to be/,
    );
    expect((await r('{"kind":"image","item":"../x","apply":false}')).error?.message).toMatch(
      /not an image key/,
    );
    expect(await q('select id from notes where id = $1', ['AP-BC-C2-08'])).toHaveLength(1);
  });

  it('the importer of before (save_note called by service_role) also brings an article back with its version', async () => {
    const p = everything();
    p.notes[0] = article('AP-BC-C2-08', BC, 'Transcripción, corregida', 1);
    await importAll(p);
    const versions = 'select version, published_at, version_at from notes where id = $1';
    const [v2] = await q(versions, ['AP-BC-C2-08']);
    expect(v2!.version).toBe(2);
    await run(p, { kind: 'note', id: 'AP-BC-C2-08' });
    const { updatedAt: _u, media: _m, ...n } = p.notes[0]!;
    expect((await rpc.rpc('save_note', { n })).error).toBeNull();
    expect(await q(versions, ['AP-BC-C2-08'])).toEqual([v2]);
  });

  it('the importer with a list that names a deck, without the command: the import itself takes it off', async () => {
    await writeFile(
      listFile,
      JSON.stringify({
        items: [
          { kind: 'deck', id: leafOf(AN), reason: 'A pedido del docente', date: '2026-11-08' },
        ],
      }),
    );
    const { report, skipped } = await importAll(everything());
    expect(skipped).toEqual([
      { kind: 'deck', id: leafOf(AN), what: '«01 - Tema» (1 mazo, 1 notas, 1 tarjetas)' },
    ]);
    expect(report.removedCards).toBe(1);
    expect(report.retiredCards).toBe(1);
    expect(await q('select id from anki_decks where id = $1', [leafOf(AN)])).toEqual([]);
    expect(JSON.parse(await readFile(listFile, 'utf8')).items).toHaveLength(1);
  });

  it('ContentBundle stays valid without what the list takes out', async () => {
    const { bundle, media } = bundleOf(everything());
    const off = withoutUnpublished(bundle, media, [
      { kind: 'note', id: 'AP-BC-C2-08', reason: 'x', date: '2026-11-08' },
      { kind: 'deck', id: leafOf(BC), reason: 'x', date: '2026-11-08' },
    ]);
    expect(() => ContentBundle.parse(off.bundle)).not.toThrow();
    expect([...off.media.keys()]).not.toContain('notes/ap-bc-c2-08.webp');
    expect([...off.media.keys()]).not.toContain('cards/bc-1.webp');
    expect(off.bundle.ankiNotes.map((n) => n.guid)).toEqual(['an-1']);
  });

  it('an image of the list never goes in the images to write, even one that no piece names', () => {
    const { bundle, media } = bundleOf(everything());
    const KEY = 'cards/0123456789abcdef0123456789abcdef.webp';
    media.set(KEY, {
      key: KEY,
      width: 1,
      height: 1,
      contentType: 'image/webp',
      read: async () => Buffer.from('x'),
    });
    const off = withoutUnpublished(bundle, media, [
      { kind: 'image', id: KEY, reason: 'x', date: '2026-11-08' },
    ]);
    expect(off.media.has(KEY)).toBe(false);
    expect(off.media.size).toBe(media.size - 1);
    expect(off.bundle).toBe(bundle);
  });
});
