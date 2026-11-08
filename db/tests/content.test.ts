import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyMigration, asUser, createDatabase } from './pglite';

let db: PGlite;

beforeAll(async () => {
  db = await createDatabase('content');
  await db.exec(`
    insert into semesters values (2, '2° Semestre');
    insert into courses values ('biologia-celular', 2, 'Biología celular', '🧬', 1);
    insert into assessments values ('biologia-celular/certamen-2', 'biologia-celular', 'Certamen 2', 2);
    insert into notes (id, slug, course_id, assessment_id, kind, title, position, document, hash)
    values ('AP-BC-C2-09', '09-transcripcion-ii', 'biologia-celular', 'biologia-celular/certamen-2',
            'lecture', 'Transcripción II', 3, '{}', 'h1'),
           ('AP-BC-C2-11', '11-traduccion', 'biologia-celular', 'biologia-celular/certamen-2',
            'lecture', 'Traducción', 5, '{}', 'h2');
    insert into note_sections (note_id, position, anchor, title, level, body) values
      ('AP-BC-C2-09', 0, 'nucleolo', 'El nucléolo', 2,
       'El nucléolo es el sitio de la transcripción del rRNA por la RNA polimerasa I.'),
      ('AP-BC-C2-11', 0, 'codigo', 'El código genético', 2,
       'Los codones del mRNA se leen de a tres. La traducción ocurre en los ribosomas.'),
      ('AP-BC-C2-11', 1, 'ribosomas', 'Ribosomas', 2,
       'Los ribosomas tienen dos subunidades y un sitio A, P y E.');
  `);
});

type Row = { note_id: string; anchor: string; snippet: string; score: number };
const search = async (q: string) =>
  (await db.query<Row>('select * from public.search_notes($1)', [q])).rows;

describe('search_notes', () => {
  it('finds regardless of accents', async () => {
    expect((await search('nucleolo')).map((r) => r.anchor)).toEqual(['nucleolo']);
    expect((await search('NUCLÉOLO')).map((r) => r.anchor)).toEqual(['nucleolo']);
  });

  it('searches by prefix while typing', async () => {
    const r = await search('ribos');
    expect(r.map((x) => x.anchor).sort()).toEqual(['codigo', 'ribosomas']);
  });

  it('the section title weighs more than the body', async () => {
    const r = await search('ribosomas');
    expect(r[0]!.anchor).toBe('ribosomas');
  });

  it('every word has to be there', async () => {
    expect((await search('codones ribosomas')).map((r) => r.anchor)).toEqual(['codigo']);
  });

  it('highlights the matches in the snippet', async () => {
    const [r] = await search('polimerasa');
    expect(r!.snippet).toContain('⟦polimerasa⟧');
  });

  it('does not break with empty or odd queries', async () => {
    for (const q of ['', '   ', "'); drop table notes; --", '&|!():*', '---', 'de la']) {
      await expect(search(q)).resolves.toBeInstanceOf(Array);
    }
    expect(await search("'); drop table notes; --")).toEqual([]);
    const left = await db.query('select count(*)::int as n from notes');
    expect(left.rows[0]).toEqual({ n: 2 });
  });
});

describe('access', () => {
  it('anon and authenticated cannot read the tables (only the API with service_role)', async () => {
    const user = { sub: '00000000-0000-4000-8000-00000000000a', email: 'ana@ug.uchile.cl' };
    for (const claims of [null, user]) {
      await expect(
        asUser(db, claims, (tx) => tx.query('select * from public.notes')),
      ).rejects.toThrow(/permission denied/);
      await expect(
        asUser(db, claims, (tx) => tx.query(`select * from public.search_notes('ribosomas')`)),
      ).rejects.toThrow(/permission denied/);
    }
  });

  it('service_role reads everything', async () => {
    const r = await db.transaction(async (tx) => {
      await tx.exec('set local role service_role');
      return tx.query('select id from public.notes order by position');
    });
    expect(r.rows).toHaveLength(2);
  });
});

describe('save_note and save_catalog', () => {
  const asService = <T>(fn: (tx: Pick<PGlite, 'query'>) => Promise<T>) =>
    db.transaction(async (tx) => {
      await tx.exec('set local role service_role');
      return fn(tx);
    });
  const note = {
    id: 'AP-BC-C2-12',
    slug: '12-comunicacion-celular',
    courseId: 'biologia-celular',
    assessmentId: 'biologia-celular/certamen-2',
    kind: 'lecture',
    title: 'Comunicación celular',
    position: 6,
    sources: ['Fuentes: diapositivas'],
    html: '<p>Hola</p>',
    toc: [{ anchor: 'gpcr', title: 'GPCR', level: 2 }],
    sections: [
      { anchor: '', title: 'Comunicación celular', level: 1, text: 'Intro' },
      { anchor: 'gpcr', title: 'GPCR', level: 2, text: 'Receptores acoplados a proteína G' },
    ],
    hash: 'v1',
  };

  it('the catalog can be saved twice without duplicates', async () => {
    const c = {
      semesters: [{ number: 1, name: '1° Semestre' }],
      courses: [{ id: 'anatomia-1', semester: 1, name: 'Anatomía I', emoji: '🦴', position: 1 }],
      assessments: [],
    };
    await asService((tx) => tx.query('select public.save_catalog($1)', [c]));
    await asService((tx) => tx.query('select public.save_catalog($1)', [c]));
    const r = await db.query('select count(*)::int as n from courses');
    expect(r.rows[0]).toEqual({ n: 2 });
  });

  it('the date an author suggests for an assessment is optional, and can be changed', async () => {
    const c = (suggestedDate?: string | null) => ({
      semesters: [],
      courses: [],
      assessments: [
        {
          id: 'biologia-celular/certamen-2',
          courseId: 'biologia-celular',
          name: 'Certamen 2',
          position: 2,
          ...(suggestedDate === undefined ? {} : { suggestedDate }),
        },
      ],
    });
    const date = async () =>
      (
        await db.query<{ d: string | null }>(
          `select suggested_date::text as d from assessments where id = 'biologia-celular/certamen-2'`,
        )
      ).rows[0]!.d;
    await asService((tx) => tx.query('select public.save_catalog($1)', [c()]));
    expect(await date()).toBeNull();
    await asService((tx) => tx.query('select public.save_catalog($1)', [c('2026-11-05')]));
    expect(await date()).toBe('2026-11-05');
    await asService((tx) => tx.query('select public.save_catalog($1)', [c(null)]));
    expect(await date()).toBeNull();
  });

  it('the migration keeps the catalog, an import without dates still works, and only the service can write', async () => {
    const old = await createDatabase('content', [], '20261105000000_suggested_date.sql');
    await old.exec(`
      insert into semesters values (2, '2° Semestre');
      insert into courses values ('biologia-celular', 2, 'Biología celular', '🧬', 1);
      insert into assessments values ('biologia-celular/certamen-2', 'biologia-celular', 'Certamen 2', 2);
    `);
    await applyMigration(old, 'content', '20261105000000_suggested_date.sql');
    const row = async () =>
      (
        await old.query(
          `select name, position, suggested_date from assessments where id = 'biologia-celular/certamen-2'`,
        )
      ).rows[0];
    expect(await row()).toEqual({ name: 'Certamen 2', position: 2, suggested_date: null });
    const catalog = {
      semesters: [{ number: 2, name: '2° Semestre' }],
      courses: [
        { id: 'biologia-celular', semester: 2, name: 'Biología celular', emoji: '🧬', position: 1 },
      ],
      assessments: [
        {
          id: 'biologia-celular/certamen-2',
          courseId: 'biologia-celular',
          name: 'Certamen dos',
          position: 2,
        },
      ],
    };
    await old.query('select public.save_catalog($1)', [catalog]);
    expect(await row()).toEqual({ name: 'Certamen dos', position: 2, suggested_date: null });
    await expect(
      asUser(old, { sub: '00000000-0000-4000-8000-00000000000a', email: 'a@ug.uchile.cl' }, (tx) =>
        tx.query('select public.save_catalog($1)', [catalog]),
      ),
    ).rejects.toThrow(/permission denied/);
    await old.close();
  });

  it('saves the note with its sections and does not rewrite it if the hash is the same', async () => {
    const save = (n: object) =>
      asService((tx) => tx.query<{ ok: boolean }>('select public.save_note($1) as ok', [n]));
    expect((await save(note)).rows[0]!.ok).toBe(true);
    expect((await save(note)).rows[0]!.ok).toBe(false);
    expect((await search('acoplados')).map((r) => r.note_id)).toEqual(['AP-BC-C2-12']);

    const v2 = {
      ...note,
      hash: 'v2',
      sections: [{ anchor: 'rtk', title: 'RTK', level: 2, text: 'Tirosina quinasa' }],
    };
    expect((await save(v2)).rows[0]!.ok).toBe(true);
    expect(await search('acoplados')).toEqual([]);
    expect((await search('quinasa')).map((r) => r.anchor)).toEqual(['rtk']);
    const doc = await db.query<{ document: object }>(
      `select document from notes where id = 'AP-BC-C2-12'`,
    );
    expect(doc.rows[0]!.document).toEqual({
      sources: note.sources,
      html: note.html,
      toc: note.toc,
    });
  });

  it('nobody but service_role can write', async () => {
    const user = { sub: '00000000-0000-4000-8000-00000000000a', email: 'ana@ug.uchile.cl' };
    await expect(
      asUser(db, user, (tx) => tx.query('select public.save_note($1)', [note])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, user, (tx) => tx.query(`insert into public.semesters values (14, 'x')`)),
    ).rejects.toThrow(/permission denied/);
  });

  it('anon and authenticated cannot truncate tables (TRUNCATE skips RLS)', async () => {
    const user = { sub: '00000000-0000-4000-8000-00000000000a', email: 'ana@ug.uchile.cl' };
    for (const claims of [null, user]) {
      for (const table of ['note_sections', 'notes', 'assessments', 'courses', 'semesters']) {
        await expect(
          asUser(db, claims, (tx) => tx.query(`truncate public.${table} cascade`)),
        ).rejects.toThrow(/permission denied/);
      }
    }
    const left = await db.query('select count(*)::int as n from notes');
    expect(left.rows[0]).toEqual({ n: 3 });
  });
});
