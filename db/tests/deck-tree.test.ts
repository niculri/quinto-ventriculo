/**
 * v1.3 (content): the whole deck tree. The migration has to keep the decks already published (and their
 * cards) as they were, and give them their semester; the parents above the assessment have no course or
 * assessment.
 */
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyMigration, asUser, createDatabase } from './pglite';

const MIGRATION = '20261102000000_deck_tree.sql';
const ANA = { sub: '00000000-0000-4000-8000-00000000000a', email: 'ana@ug.uchile.cl' };
const DECK = '2059400110';
const EXTRAS = '2059400111';
const ROOT = '1000000000000000001';
const SEMESTER = '1000000000000000002';
const COURSE = '1000000000000000003';
const ASSESSMENT = '1000000000000000004';
const WEEK = '1000000000000000005';
const W = '() Medicina UCH::1° Semestre::🦴 Anatomía I::Certamen 1::S3 - Columna';

let db: PGlite;

const asService = <T>(fn: (tx: Pick<PGlite, 'query'>) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.exec('set local role service_role');
    return fn(tx);
  });

const noteType = {
  id: '1607392319',
  name: 'Básica',
  kind: 'normal',
  occlusion: false,
  fields: ['Frente', 'Reverso', 'Código'],
  templates: [{ name: 'Directa', qfmt: '{{Frente}}', afmt: '{{FrontSide}}{{Reverso}}' }],
  css: '.card {}',
  sortField: 0,
};
const presets = [
  { name: 'Default', config: { new: { perDay: 20 } } },
  { name: 'Extras', config: { new: { perDay: 0 } } },
];
const level = { semester: 1, courseId: 'anatomia-1', assessmentId: 'anatomia-1/certamen-1' };
const deck = (id: string, name: string, parentId: string | null, preset = 'Default') => ({
  id,
  name,
  description: '',
  parentId,
  preset,
  position: 0,
});
const card = (ord: number, deckId: string) => ({
  ord,
  deckId,
  frontHtml: `<p>${ord}</p>`,
  backHtml: `<p>${ord}</p>`,
  sortField: `tarjeta ${ord}`,
});

beforeAll(async () => {
  // A database as it is in production: v1.1 with the deck «01» and its Extras (and their cards).
  db = await createDatabase('content', [], MIGRATION);
  await db.exec(`
    insert into semesters values (1, '1° Semestre');
    insert into courses values ('anatomia-1', 1, 'Anatomía I', '🦴', 3);
    insert into assessments values ('anatomia-1/certamen-1', 'anatomia-1', 'Certamen 1', 1);
  `);
  await asService((tx) =>
    tx.query('select public.save_anki_catalog($1)', [
      {
        presets,
        noteTypes: [noteType],
        decks: [
          {
            ...deck(DECK, `${W}::01 - Columna vertebral`, null),
            courseId: 'anatomia-1',
            assessmentId: 'anatomia-1/certamen-1',
          },
          {
            ...deck(EXTRAS, `${W}::01 - Columna vertebral::Extras`, DECK, 'Extras'),
            courseId: 'anatomia-1',
            assessmentId: 'anatomia-1/certamen-1',
          },
        ],
      },
    ]),
  );
  await asService((tx) =>
    tx.query('select public.save_anki_note($1)', [
      {
        guid: 'nota-1',
        noteTypeId: noteType.id,
        fields: { Frente: '<b>Atlas</b>&nbsp;y axis', Reverso: 'C1 &amp; C2<br>', Código: '' },
        tags: ['columna'],
        code: 'T-A1-S3-01-001',
        version: 1,
        hash: 'h1',
        cards: [card(0, DECK)],
      },
    ]),
  );
  await asService((tx) =>
    tx.query('select public.save_anki_note($1)', [
      {
        guid: 'nota-2',
        noteTypeId: noteType.id,
        fields: { Frente: 'Extra', Reverso: '', Código: '' },
        tags: [],
        code: 'T-A1-S3-01-002',
        version: 1,
        hash: 'h2',
        cards: [card(0, EXTRAS)],
      },
    ]),
  );
  await applyMigration(db, 'content', MIGRATION);
});

describe('the deck tree migration', () => {
  it('keeps the published decks and cards, and gives them their semester', async () => {
    const decks = await db.query(
      'select id, parent, semester, course_id from anki_decks order by id',
    );
    expect(decks.rows).toEqual([
      { id: DECK, parent: null, semester: 1, course_id: 'anatomia-1' },
      { id: EXTRAS, parent: DECK, semester: 1, course_id: 'anatomia-1' },
    ]);
    const cards = await db.query('select note_guid, deck_id from anki_cards order by note_guid');
    expect(cards.rows).toEqual([
      { note_guid: 'nota-1', deck_id: DECK },
      { note_guid: 'nota-2', deck_id: EXTRAS },
    ]);
  });

  it('saves the parents above the assessment without course or assessment', async () => {
    await asService((tx) =>
      tx.query('select public.save_anki_catalog($1)', [
        {
          presets,
          noteTypes: [noteType],
          decks: [
            { ...deck(EXTRAS, `${W}::01 - Columna vertebral::Extras`, DECK, 'Extras'), ...level },
            { ...deck(DECK, `${W}::01 - Columna vertebral`, WEEK), ...level },
            { ...deck(WEEK, W, ASSESSMENT), ...level },
            {
              ...deck(ASSESSMENT, W.split('::').slice(0, 4).join('::'), COURSE),
              ...level,
            },
            {
              ...deck(COURSE, W.split('::').slice(0, 3).join('::'), SEMESTER),
              ...level,
              assessmentId: null,
            },
            {
              ...deck(SEMESTER, W.split('::').slice(0, 2).join('::'), ROOT),
              semester: 1,
              courseId: null,
              assessmentId: null,
            },
            {
              ...deck(ROOT, '() Medicina UCH', null),
              semester: null,
              courseId: null,
              assessmentId: null,
            },
          ],
        },
      ]),
    );
    const decks = await db.query(
      'select id, parent, semester, course_id, assessment_id from anki_decks order by name collate "C"',
    );
    expect(decks.rows).toEqual([
      { id: ROOT, parent: null, semester: null, course_id: null, assessment_id: null },
      { id: SEMESTER, parent: ROOT, semester: 1, course_id: null, assessment_id: null },
      { id: COURSE, parent: SEMESTER, semester: 1, course_id: 'anatomia-1', assessment_id: null },
      { id: ASSESSMENT, parent: COURSE, semester: 1, ...assessmentOf },
      { id: WEEK, parent: ASSESSMENT, semester: 1, ...assessmentOf },
      { id: DECK, parent: WEEK, semester: 1, ...assessmentOf },
      { id: EXTRAS, parent: DECK, semester: 1, ...assessmentOf },
    ]);
  });

  it('refuses an assessment without its course, or a course without its semester', async () => {
    await expect(
      db.query(`update anki_decks set course_id = null where id = '${DECK}'`),
    ).rejects.toThrow(/anki_decks_levels/);
    await expect(
      db.query(`update anki_decks set semester = null where id = '${COURSE}'`),
    ).rejects.toThrow(/anki_decks_levels/);
  });

  it('anki_deck_tree: every deck with the notes and cards of its subtree, parents first', async () => {
    const r = await asService((tx) =>
      tx.query<{ id: string; preset: string; note_count: number; card_count: number }>(
        'select id, preset, note_count, card_count from public.anki_deck_tree()',
      ),
    );
    expect(r.rows.map((x) => [x.id, x.preset, x.note_count, x.card_count])).toEqual([
      [ROOT, 'Default', 2, 2],
      [SEMESTER, 'Default', 2, 2],
      [COURSE, 'Default', 2, 2],
      [ASSESSMENT, 'Default', 2, 2],
      [WEEK, 'Default', 2, 2],
      [DECK, 'Default', 2, 2],
      [EXTRAS, 'Extras', 1, 1],
    ]);
  });

  it('anki_deck works from the root: every card below it, no course', async () => {
    const r = await asService((tx) =>
      tx.query<{ d: Record<string, unknown> }>('select public.anki_deck($1) as d', [ROOT]),
    );
    const d = r.rows[0]!.d as { courseId: unknown; cardCount: number; subdecks: unknown[] };
    expect(d.courseId).toBeNull();
    expect(d.cardCount).toBe(2);
    expect(d.subdecks).toHaveLength(6);
  });

  it('anki_browse_notes: plain-text fields in order, tags, code, creation and cards', async () => {
    await asService((tx) =>
      tx.query('select public.save_anki_note($1)', [
        {
          guid: 'nota-1',
          noteTypeId: noteType.id,
          fields: { Reverso: 'C1 &amp; C2<br>', Frente: '<b>Atlas</b>&nbsp;y axis', Código: '' },
          tags: ['columna'],
          code: 'T-A1-S3-01-001',
          version: 2,
          createdAt: '2026-10-08T12:00:00.000Z',
          hash: 'h1b',
          cards: [card(0, DECK)],
        },
      ]),
    );
    const r = await asService((tx) =>
      tx.query<{ n: { notes: unknown[] } }>('select public.anki_browse_notes() as n'),
    );
    expect(r.rows[0]!.n.notes).toEqual([
      {
        guid: 'nota-1',
        noteTypeId: noteType.id,
        tags: ['columna'],
        code: 'T-A1-S3-01-001',
        version: 2,
        createdAt: '2026-10-08T12:00:00+00:00',
        fields: ['Atlas y axis', 'C1 & C2', ''],
        sortField: 'tarjeta 0',
        cards: [{ ord: 0, deckId: DECK }],
      },
      {
        guid: 'nota-2',
        noteTypeId: noteType.id,
        tags: [],
        code: 'T-A1-S3-01-002',
        version: 1,
        createdAt: null,
        fields: ['Extra', '', ''],
        sortField: 'tarjeta 0',
        cards: [{ ord: 0, deckId: EXTRAS }],
      },
    ]);
  });

  it('anki_deck_detail: the DeckDetail of the API, as the v1.2 Worker built it from anki_deck', async () => {
    const leaf = (name: string) => name.split('::').at(-1)!;
    for (const id of [ROOT, ASSESSMENT, DECK, EXTRAS]) {
      const r = await asService(async (tx) => {
        const detail = await tx.query<{ d: Record<string, unknown> }>(
          'select public.anki_deck_detail($1) as d',
          [id],
        );
        const old = await tx.query<{ d: Record<string, unknown> & { name: string } }>(
          'select public.anki_deck($1) as d',
          [id],
        );
        const presets = await tx.query('select name, config from anki_presets order by name');
        return { detail: detail.rows[0]!.d, old: old.rows[0]!.d, presets: presets.rows };
      });
      // The v1.2 Worker parsed it with DeckDetail, which drops the deck's own `parent`.
      const { parent: _parent, ...old } = r.old;
      const subdecks = r.old['subdecks'] as { parent: string | null; name: string }[];
      expect(r.detail).toEqual({
        ...old,
        name: leaf(r.old.name),
        fullName: r.old.name,
        subdecks: subdecks.map(({ parent, name, ...x }) => ({
          ...x,
          name: leaf(name),
          parentId: parent,
        })),
        presets: r.presets,
      });
    }
    const missing = await asService((tx) =>
      tx.query<{ d: unknown }>('select public.anki_deck_detail($1) as d', ['999']),
    );
    expect(missing.rows[0]!.d).toBeNull();
  });

  it('anon and authenticated cannot call the new reads', async () => {
    for (const claims of [null, ANA]) {
      for (const call of [
        'select public.anki_deck_tree()',
        `select public.anki_deck_detail('${ROOT}')`,
        'select public.anki_browse_notes()',
        `select public.anki_plain_text('x')`,
      ]) {
        await expect(asUser(db, claims, (tx) => tx.query(call))).rejects.toThrow(
          /permission denied/,
        );
      }
    }
  });
});

const assessmentOf = { course_id: 'anatomia-1', assessment_id: 'anatomia-1/certamen-1' };
