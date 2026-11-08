import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './pglite';

let db: PGlite;

const asService = <T>(fn: (tx: Pick<PGlite, 'query'>) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.exec('set local role service_role');
    return fn(tx);
  });

const ANA = { sub: '00000000-0000-4000-8000-00000000000a', email: 'ana@ug.uchile.cl' };
const ROOT = '2059400110';
const EXTRAS = '2059400111';

const catalog = {
  presets: [
    { name: 'Default', config: { id: 1, name: 'Default', new: { perDay: 20 } } },
    { name: 'Extras', config: { id: 2, name: 'Extras', new: { perDay: 0 } } },
  ],
  noteTypes: [
    {
      id: '1607392319',
      name: 'Básica',
      kind: 'normal',
      occlusion: false,
      fields: ['Frente', 'Reverso'],
      templates: [{ name: 'Directa', qfmt: '{{Frente}}', afmt: '{{FrontSide}}{{Reverso}}' }],
      css: '.card { color: red; }',
      sortField: 0,
    },
    {
      id: '1607392321',
      name: 'Oclusión',
      kind: 'cloze',
      occlusion: true,
      fields: ['Oclusión', 'Imagen'],
      templates: [{ name: 'Oclusión', qfmt: '{{cloze:Oclusión}}', afmt: '{{cloze:Oclusión}}' }],
      css: '.card { color: blue; }',
      sortField: 0,
    },
  ],
  // The child first: save_anki_catalog has to cope with any order.
  decks: [
    {
      id: EXTRAS,
      name: 'Raíz::Mazo::Extras',
      description: '',
      parentId: ROOT,
      courseId: 'anatomia-1',
      assessmentId: 'anatomia-1/certamen-1',
      preset: 'Extras',
      position: 0,
    },
    {
      id: ROOT,
      name: 'Raíz::Mazo',
      description: 'Hecho para las pruebas',
      parentId: null,
      courseId: 'anatomia-1',
      assessmentId: 'anatomia-1/certamen-1',
      preset: 'Default',
      position: 1,
    },
  ],
};

const card = (ord: number, deckId: string, text = `tarjeta ${ord}`) => ({
  ord,
  deckId,
  frontHtml: `<p>frente ${ord}</p><img data-media="cards/0123456789abcdef0123456789abcdef.webp">`,
  backHtml: `<p>reverso ${ord}</p>`,
  sortField: text,
});

const basicNote = {
  guid: 'Or&8~[!Z2<',
  noteTypeId: '1607392319',
  fields: { Frente: '¿Cuántas?', Reverso: '7' },
  tags: ['prueba', 'columna::cervical'],
  code: 'T-PR-01-001',
  version: 2,
  hash: 'v1',
  cards: [card(0, ROOT, '¿Cuántas?')],
};
const occlusionNote = {
  guid: 'oclusion-1',
  noteTypeId: '1607392321',
  fields: { Oclusión: '{{c1::image-occlusion:rect:left=.1}}', Imagen: '<img src="a.png">' },
  tags: [],
  code: 'T-PR-01-002',
  version: 1,
  hash: 'o1',
  cards: [card(0, ROOT), card(1, ROOT), card(2, EXTRAS)],
};

beforeAll(async () => {
  db = await createDatabase('content');
  await db.exec(`
    insert into semesters values (1, '1° Semestre');
    insert into courses values ('anatomia-1', 1, 'Anatomía I', '🦴', 3);
    insert into assessments values ('anatomia-1/certamen-1', 'anatomia-1', 'Certamen 1', 1);
  `);
  await asService((tx) => tx.query('select public.save_anki_catalog($1)', [catalog]));
  await asService((tx) => tx.query('select public.save_anki_catalog($1)', [catalog]));
});

const saveNote = (n: object) =>
  asService((tx) => tx.query<{ ok: boolean }>('select public.save_anki_note($1) as ok', [n]));

describe('save_anki_catalog', () => {
  it('saves presets, note types and decks with their parent, twice without duplicates', async () => {
    const decks = await db.query<{ id: string; parent: string | null; preset: string }>(
      'select id, parent, preset from anki_decks order by id',
    );
    expect(decks.rows).toEqual([
      { id: ROOT, parent: null, preset: 'Default' },
      { id: EXTRAS, parent: ROOT, preset: 'Extras' },
    ]);
    const presets = await db.query<{ config: object }>(
      `select config from anki_presets where name = 'Extras'`,
    );
    expect(presets.rows[0]!.config).toEqual({ id: 2, name: 'Extras', new: { perDay: 0 } });
    const types = await db.query('select id from anki_note_types');
    expect(types.rows).toHaveLength(2);
  });
});

describe('save_anki_note', () => {
  it('saves the note with its cards and does not rewrite it if the hash is the same', async () => {
    expect((await saveNote(basicNote)).rows[0]!.ok).toBe(true);
    expect((await saveNote(basicNote)).rows[0]!.ok).toBe(false);
    expect((await saveNote(occlusionNote)).rows[0]!.ok).toBe(true);
    const n = await db.query<{ tags: string[]; code: string; version: number }>(
      `select tags, code, version from anki_notes where guid = 'Or&8~[!Z2<'`,
    );
    expect(n.rows[0]).toEqual({
      tags: ['prueba', 'columna::cervical'],
      code: 'T-PR-01-001',
      version: 2,
    });
  });

  it('a new version updates the cards in place and removes the ones that are gone', async () => {
    await saveNote({
      ...occlusionNote,
      hash: 'o2',
      cards: [card(0, ROOT, 'cambiada'), card(2, EXTRAS)],
    });
    const cards = await db.query<{ ord: number; sort_field: string }>(
      `select ord, sort_field from anki_cards where note_guid = 'oclusion-1' order by ord`,
    );
    expect(cards.rows).toEqual([
      { ord: 0, sort_field: 'cambiada' },
      { ord: 2, sort_field: 'tarjeta 2' },
    ]);
    await saveNote(occlusionNote);
  });
});

describe('reads', () => {
  it('anki_deck_summaries counts notes and cards of the whole subtree', async () => {
    const r = await asService((tx) =>
      tx.query('select * from public.anki_deck_summaries() order by id'),
    );
    expect(r.rows).toEqual([
      {
        id: ROOT,
        name: 'Raíz::Mazo',
        parent: null,
        assessment_id: 'anatomia-1/certamen-1',
        position: 1,
        note_count: 2,
        card_count: 4,
      },
      {
        id: EXTRAS,
        name: 'Raíz::Mazo::Extras',
        parent: ROOT,
        assessment_id: 'anatomia-1/certamen-1',
        position: 0,
        note_count: 1,
        card_count: 1,
      },
    ]);
  });

  it('anki_deck: the deck, its subdecks and its cards sorted by code and ord', async () => {
    const r = await asService((tx) =>
      tx.query<{ d: Record<string, unknown> }>('select public.anki_deck($1) as d', [ROOT]),
    );
    const deck = r.rows[0]!.d;
    expect(deck).toMatchObject({
      id: ROOT,
      name: 'Raíz::Mazo',
      description: 'Hecho para las pruebas',
      courseId: 'anatomia-1',
      preset: 'Default',
      noteCount: 2,
      cardCount: 4,
      subdecks: [{ id: EXTRAS, parent: ROOT, preset: 'Extras', cardCount: 1 }],
    });
    expect(
      (deck['cards'] as { code: string; ord: number; kind: string }[]).map((c) => [
        c.code,
        c.ord,
        c.kind,
      ]),
    ).toEqual([
      ['T-PR-01-001', 0, 'basic'],
      ['T-PR-01-002', 0, 'occlusion'],
      ['T-PR-01-002', 1, 'occlusion'],
      ['T-PR-01-002', 2, 'occlusion'],
    ]);
    const missing = await asService((tx) =>
      tx.query<{ d: unknown }>('select public.anki_deck($1) as d', ['999']),
    );
    expect(missing.rows[0]!.d).toBeNull();
  });

  it('anki_card: front, back, CSS and kind', async () => {
    const r = await asService((tx) =>
      tx.query<{ c: Record<string, unknown> }>('select public.anki_card($1, $2) as c', [
        'oclusion-1',
        2,
      ]),
    );
    expect(r.rows[0]!.c).toMatchObject({
      noteGuid: 'oclusion-1',
      ord: 2,
      deckId: EXTRAS,
      kind: 'occlusion',
      back: '<p>reverso 2</p>',
      css: '.card { color: blue; }',
    });
    const none = await asService((tx) =>
      tx.query<{ c: unknown }>('select public.anki_card($1, $2) as c', ['oclusion-1', 9]),
    );
    expect(none.rows[0]!.c).toBeNull();
  });
});

describe('access', () => {
  const tables = ['anki_cards', 'anki_notes', 'anki_decks', 'anki_note_types', 'anki_presets'];

  it('anon and authenticated can neither read, write nor truncate', async () => {
    for (const claims of [null, ANA]) {
      for (const table of tables) {
        await expect(
          asUser(db, claims, (tx) => tx.query(`select * from public.${table}`)),
        ).rejects.toThrow(/permission denied/);
        await expect(
          asUser(db, claims, (tx) => tx.query(`truncate public.${table} cascade`)),
        ).rejects.toThrow(/permission denied/);
      }
      await expect(
        asUser(db, claims, (tx) => tx.query(`delete from public.anki_cards`)),
      ).rejects.toThrow(/permission denied/);
    }
  });

  it('nor call the functions (reads or writes)', async () => {
    for (const claims of [null, ANA]) {
      for (const call of [
        'select public.anki_deck_summaries()',
        `select public.anki_deck('${ROOT}')`,
        `select public.anki_card('oclusion-1', 0)`,
        `select public.save_anki_note('{}'::jsonb)`,
        `select public.save_anki_catalog('{}'::jsonb)`,
        `select public.prune_anki('{}'::jsonb)`,
      ]) {
        await expect(asUser(db, claims, (tx) => tx.query(call))).rejects.toThrow(
          /permission denied/,
        );
      }
    }
  });
});

describe('prune_anki', () => {
  it('refuses a payload without its lists (it would empty everything)', async () => {
    await expect(
      asService((tx) => tx.query('select public.prune_anki($1)', [{ noteGuids: [] }])),
    ).rejects.toThrow(/needs the arrays/);
    const left = await db.query('select count(*)::int as n from anki_notes');
    expect(left.rows[0]).toEqual({ n: 2 });
  });

  it('removes what is no longer published, children before parents', async () => {
    const r = await asService((tx) =>
      tx.query<{ n: number }>('select public.prune_anki($1) as n', [
        {
          noteGuids: ['Or&8~[!Z2<'],
          deckIds: [ROOT],
          noteTypeIds: ['1607392319'],
          presets: ['Default'],
        },
      ]),
    );
    expect(r.rows[0]!.n).toBe(1);
    const counts = await db.query<Record<string, number>>(`
      select (select count(*)::int from anki_notes) as notes,
             (select count(*)::int from anki_cards) as cards,
             (select count(*)::int from anki_decks) as decks,
             (select count(*)::int from anki_note_types) as types,
             (select count(*)::int from anki_presets) as presets`);
    expect(counts.rows[0]).toEqual({ notes: 1, cards: 1, decks: 1, types: 1, presets: 1 });
  });
});
