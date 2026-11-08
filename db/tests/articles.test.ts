/**
 * v1.5 on the content database as production has it: a note published as a PDF note (before the
 * migration), the migration, and then the same note saved as an article, as CloudTarget saves it.
 */
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyMigration, createDatabase } from './pglite';

const MIGRATION = '20261104000000_articles.sql';

let db: PGlite;

const asService = <T>(fn: (tx: Pick<PGlite, 'query'>) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.exec('set local role service_role');
    return fn(tx);
  });
const save = async (n: object) =>
  (await asService((tx) => tx.query<{ ok: boolean }>('select public.save_note($1) as ok', [n])))
    .rows[0]!.ok;

interface Row {
  code: string | null;
  version: number | null;
  published_at: Date | null;
  version_at: Date | null;
  updated_at: Date;
  document: Record<string, unknown>;
}
const read = async (id = 'AP-BC-C2-08') =>
  (
    await db.query<Row>(
      'select code, version, published_at, version_at, updated_at, document from notes where id = $1',
      [id],
    )
  ).rows[0]!;
/** now() is the transaction's: a small wait so that two saves do not share it. */
const tick = () => new Promise((r) => setTimeout(r, 15));

const pdfNote = {
  id: 'AP-BC-C2-08',
  slug: '08-expresion-genica-y-transcripcion',
  courseId: 'biologia-celular',
  assessmentId: 'biologia-celular/certamen-2',
  kind: 'lecture',
  title: 'Expresión génica y transcripción',
  subtitle: 'Clase N.º 8 · Dra. Ana Prueba D.',
  position: 2,
  sources: ['Fuentes: diapositivas'],
  html: '<p>Apunte</p>',
  toc: [],
  sections: [{ anchor: '', title: 'Expresión génica', level: 1, text: 'Apunte' }],
  hash: 'pdf',
};

const article = {
  ...pdfNote,
  subtitle: undefined,
  code: 'QV-BC-C2-08',
  header: { number: '8', lecturer: 'Dra. Ana Prueba D.', term: 'spring', year: 2026 },
  practice: { quizId: 'biologia-celular-certamen-2-preguntas-de-practica', groups: ['01'] },
  html: '<p>Artículo</p>',
  sections: [{ anchor: '', title: 'Expresión génica', level: 1, text: 'Artículo' }],
  hash: 'a1',
  versionHash: 'v1',
};

beforeAll(async () => {
  db = await createDatabase('content', [], MIGRATION);
  await db.exec(`
    insert into semesters values (2, '2° Semestre');
    insert into courses values ('biologia-celular', 2, 'Biología celular', '🧬', 1);
    insert into assessments values ('biologia-celular/certamen-2', 'biologia-celular', 'Certamen 2', 2);
  `);
  // Published with the save_note() of before.
  expect(await save(pdfNote)).toBe(true);
  await applyMigration(db, 'content', MIGRATION);
});

describe('save_note with versions (v1.5)', () => {
  it('a note published before the articles has no code nor version', async () => {
    expect(await read()).toMatchObject({ code: null, version: null, published_at: null });
  });

  it('its first save as an article is version 1, dated then, with the header and the links', async () => {
    const before = new Date();
    expect(await save(article)).toBe(true);
    const row = await read();
    expect(row).toMatchObject({ code: 'QV-BC-C2-08', version: 1 });
    expect(row.published_at!.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect(row.version_at).toEqual(row.published_at);
    expect(row.document).toEqual({
      sources: article.sources,
      html: article.html,
      toc: [],
      header: article.header,
      practice: article.practice,
    });
  });

  it('a second import without changes changes nothing (not even the version)', async () => {
    const row = await read();
    expect(await save(article)).toBe(false);
    expect(await read()).toEqual(row);
  });

  it('a change the reader does not see (position, links) keeps the version and its dates', async () => {
    const row = await read();
    await tick();
    expect(await save({ ...article, position: 9, practice: { quizId: 'otro' }, hash: 'a2' })).toBe(
      true,
    );
    const after = await read();
    expect(after).toMatchObject({ version: 1, published_at: row.published_at });
    expect(after.version_at).toEqual(row.version_at);
    expect(after.updated_at.getTime()).toBeGreaterThan(row.updated_at.getTime());
  });

  it('a change in the text is the next version: «Creado el» stays, «Actualizado el» moves', async () => {
    const row = await read();
    await tick();
    expect(
      await save({ ...article, html: '<p>Corregido</p>', hash: 'a3', versionHash: 'v2' }),
    ).toBe(true);
    const after = await read();
    expect(after.version).toBe(2);
    expect(after.published_at).toEqual(row.published_at);
    expect(after.version_at!.getTime()).toBeGreaterThan(row.version_at!.getTime());
    await tick();
    expect(await save({ ...article, hash: 'a4', versionHash: 'v3' })).toBe(true);
    expect((await read()).version).toBe(3);
  });

  it('a note without a web code still saves, without a version', async () => {
    expect(await save({ ...pdfNote, id: 'AP-BC-C2-09', slug: 'nueve', hash: 'n9' })).toBe(true);
    expect(await read('AP-BC-C2-09')).toMatchObject({ code: null, version: null });
  });

  it('the web code has its format and is unique', async () => {
    await expect(
      save({ ...article, id: 'AP-BC-C2-10', slug: 'diez', code: 'AP-BC-C2-10', hash: 'x' }),
    ).rejects.toThrow(/check/);
    await expect(save({ ...article, id: 'AP-BC-C2-11', slug: 'once', hash: 'y' })).rejects.toThrow(
      /notes_code|duplicate/,
    );
  });

  it('only service_role can save', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.exec('set local role authenticated');
        return tx.query('select public.save_note($1)', [article]);
      }),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('the migration on the ten notes production has (v1.5)', () => {
  const ids = ['08P', '08', '09', '10', '11', '12', '13', 'SEM5', 'SEM6', 'SEM8'];
  const pdf = (code: string, i: number) => ({
    ...pdfNote,
    id: `AP-BC-C2-${code}`,
    slug: `nota-${code.toLowerCase()}`,
    position: i,
    html: `<h2 id="vieja">Vieja</h2><p>Apunte ${code}</p>`,
    toc: [{ anchor: 'vieja', title: 'Vieja', level: 2 }],
    sections: [{ anchor: 'vieja', title: 'Vieja', level: 2, text: `Apunte ${code}` }],
    hash: `pdf-${code}`,
  });
  const web = (code: string, i: number) => ({
    ...pdf(code, i),
    subtitle: undefined,
    code: `QV-BC-C2-${code}`,
    header: { number: '8', term: 'spring', year: 2026 },
    html: `<h2 id="ribosomas">Ribosomas</h2><p>Artículo ${code}</p>`,
    toc: [{ anchor: 'ribosomas', title: 'Ribosomas', level: 2 }],
    sections: [{ anchor: 'ribosomas', title: 'Ribosomas', level: 2, text: `Artículo ${code}` }],
    hash: `web-${code}`,
    versionHash: `v-${code}`,
  });
  let ten: PGlite;
  const saveIn = async (n: object) =>
    (
      await ten.transaction(async (tx) => {
        await tx.exec('set local role service_role');
        return tx.query<{ ok: boolean }>('select public.save_note($1) as ok', [n]);
      })
    ).rows[0]!.ok;

  beforeAll(async () => {
    ten = await createDatabase('content', [], MIGRATION);
    await ten.exec(`
      insert into semesters values (2, '2° Semestre');
      insert into courses values ('biologia-celular', 2, 'Biología celular', '🧬', 1);
      insert into assessments values ('biologia-celular/certamen-2', 'biologia-celular', 'Certamen 2', 2);
    `);
    for (const [i, c] of ids.entries()) expect(await saveIn(pdf(c, i))).toBe(true);
    await applyMigration(ten, 'content', MIGRATION);
  });

  it('every one is version 1 at its first import as an article, and an equal import changes none', async () => {
    for (const [i, c] of ids.entries()) expect(await saveIn(web(c, i))).toBe(true);
    const rows = (
      await ten.query<{ code: string; version: number; same: boolean; header: unknown }>(
        `select code, version, published_at = version_at as same, document -> 'header' as header
           from notes order by position`,
      )
    ).rows;
    expect(rows.map((r) => r.code)).toEqual(ids.map((c) => `QV-BC-C2-${c}`));
    expect(rows.every((r) => r.version === 1 && r.same && r.header)).toBe(true);
    for (const [i, c] of ids.entries()) expect(await saveIn(web(c, i))).toBe(false);
    expect(
      (await ten.query<{ n: number }>('select count(*)::int as n from notes where version = 1'))
        .rows[0]!.n,
    ).toBe(10);
  });

  it("the search finds the articles' sections, not the old ones", async () => {
    const found = (
      await ten.transaction(async (tx) => {
        await tx.exec('set local role service_role');
        return tx.query<{ anchor: string }>(
          "select anchor from public.search_notes('artículo', 50)",
        );
      })
    ).rows;
    expect(found).toHaveLength(10);
    expect(new Set(found.map((r) => r.anchor))).toEqual(new Set(['ribosomas']));
    expect(
      (
        await ten.query<{ n: number }>(
          "select count(*)::int as n from note_sections where anchor = 'vieja'",
        )
      ).rows[0]!.n,
    ).toBe(0);
  });
});
