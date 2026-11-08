// Plan step 1.7, part 2 (B4 + B5): what the draft changes against what is published (release_summary(),
// release_items(), release_texts(), release_media()), how each change is classified, what the review list's rules see,
// the fingerprint and its marks by hand (migration 20261110000000_release_review.sql). The e2e folder's release files
// (apps/web/e2e/content/release/) come from here: `QV_WRITE_RELEASE_FIXTURES=1 npx vitest run db/tests/release.test.ts`
// and then `npx prettier --write apps/web/e2e/content/release`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { CloudTarget } from '@qv/importer';
import type { MediaStore } from '@qv/importer';
import { ContentBundle, ReleaseSummary, buildReview } from '@qv/schema';
import {
  AN,
  BC,
  ROOT,
  article,
  bundleOf,
  everything,
  image,
  leafOf,
  serviceRpc,
  withHash,
} from './import-fixtures';
import type { Parts } from './import-fixtures';
import { asUser, createDatabase } from './pglite';

let db: PGlite;
const calls: { fn: string; args: Record<string, unknown> }[] = [];
const store: MediaStore = { has: async () => true, put: async () => {} };
const published = new CloudTarget({ db: serviceRpc(() => db, calls), store });
const draft = new CloudTarget({ db: serviceRpc(() => db, calls, 'draft'), store });

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows;
const service = async <T>(sql: string, params: unknown[] = []) =>
  db.transaction(async (tx) => {
    await tx.exec('set local role service_role');
    return (await tx.query<T>(sql, params)).rows;
  });
const summary = async () =>
  ReleaseSummary.parse(
    (await service<{ r: unknown }>('select public.release_summary() as r'))[0]!.r,
  );
const items = async (assessment: string, kind: string, after: string | null = null, n = 200) =>
  (
    await service<{ r: { items: Record<string, unknown>[]; next: string | null } }>(
      'select public.release_items($1, $2, $3, $4) as r',
      [assessment, kind, after, n],
    )
  )[0]!.r;
const fingerprint = async () =>
  (await service<{ r: string }>('select public.release_fingerprint() as r'))[0]!.r;
const of = (s: ReleaseSummary, id: string) => s.assessments.find((a) => a.id === id)!;

// ─────────────────────────── notes of the site's note types (Medicina (código)) ───────────────────────────

const BASIC = {
  id: '1736420111',
  name: 'Medicina (código) · Básica',
  kind: 'normal' as const,
  occlusion: false,
  fields: [
    'Frente',
    'Reverso',
    'Imagen',
    'Extra',
    'Tema',
    'Fuente',
    'Código',
    'Creación',
    'Actualización',
  ],
  templates: [
    { name: 'Directa', qfmt: '{{Frente}}', afmt: '{{FrontSide}}<hr id=answer>{{Reverso}}' },
  ],
  css: '',
  sortField: 0,
};
const CLOZE = {
  id: '1736420112',
  name: 'Medicina (código) · Cloze',
  kind: 'cloze' as const,
  occlusion: false,
  fields: ['Texto', 'Extra', 'Imagen', 'Tema', 'Fuente', 'Código', 'Creación', 'Actualización'],
  templates: [{ name: 'Cloze', qfmt: '{{cloze:Texto}}', afmt: '{{cloze:Texto}}' }],
  css: '',
  sortField: 0,
};
const OCCLUSION = {
  id: '1736420113',
  name: 'Medicina (código) · Oclusión',
  kind: 'cloze' as const,
  occlusion: true,
  fields: [
    'Oclusión',
    'Imagen',
    'Encabezado',
    'Reverso extra',
    'Comentarios',
    'Código',
    'Creación',
    'Actualización',
  ],
  templates: [{ name: 'Oclusión', qfmt: '{{cloze:Oclusión}}', afmt: '{{cloze:Oclusión}}' }],
  css: '',
  sortField: 0,
};

type NoteType = typeof BASIC | typeof CLOZE | typeof OCCLUSION;

const rect = (n: number, left: number, top: number) =>
  `{{c${n}::image-occlusion:rect:left=${left}:top=${top}:width=.1000:height=.0500:oi=1}}`;

/** An Anki note of one of those types, its cards rendered as the field's text (front: the question side). */
const medNote = (
  guid: string,
  type: NoteType,
  fields: Record<string, string>,
  ords: number[] = [0],
  version = 1,
  deck = leafOf(AN),
) =>
  ({
    ...withHash({
      guid,
      noteTypeId: type.id,
      fields,
      tags: [],
      code: fields['Código']?.replace(/\.\d+$/, '') ?? null,
      version,
      createdAt: null,
      cards: ords.map((ord) => ({
        ord,
        deckId: deck,
        frontHtml: `<div>${fields['Frente'] ?? fields['Texto'] ?? fields['Oclusión'] ?? ''}${
          fields['Imagen'] && type === BASIC && fields['Frente']?.includes('imagen')
            ? fields['Imagen']
            : ''
        }</div>`,
        backHtml: `<div>${Object.values(fields).join(' ')}</div>`,
        sortField: fields[type.fields[0]!] ?? '',
      })),
      media: [],
    }),
    updatedAt: '2026-11-06T12:00:00.000Z',
  }) as unknown as Parts['ankiNotes'][number];

const basic = (guid: string, f: Partial<Record<string, string>>, version = 1) =>
  medNote(
    guid,
    BASIC,
    {
      Frente: '¿Cuántas vértebras cervicales hay?',
      Reverso: '7',
      Imagen: '<img src="cervical.png">',
      Extra: 'Contando el atlas.',
      Tema: 'Columna',
      Fuente: 'Netter, lám. S-137',
      Código: `T-A1-S3-01-${guid}.${version}`,
      Creación: '8-10-2026',
      Actualización: '',
      ...f,
    } as Record<string, string>,
    [0],
    version,
  );

/** Published: these notes, with the fixtures' articles and tests (both assessments). */
const BASE = () => {
  const p = everything();
  p.ankiNotes = [
    basic('001', {}),
    basic('002', { Frente: 'En la imagen de abajo, ¿qué vértebra es?', Reverso: 'Atlas' }),
    basic('003', {}),
    basic('004', {}),
    basic('005', {}),
    basic('006', {}),
    medNote(
      'c01',
      CLOZE,
      {
        Texto: 'La columna tiene {{c1::7}} cervicales y {{c2::12}} torácicas.',
        Extra: '',
        Código: 'T-A1-S3-01-c01.1',
      },
      [0, 1],
    ),
    medNote(
      'o01',
      OCCLUSION,
      {
        Oclusión: `${rect(1, 0.1, 0.1)}<br>${rect(2, 0.5, 0.5)}`,
        Imagen: '<img src="lamina.png">',
        Encabezado: 'Columna vertebral',
        'Reverso extra': '',
        Comentarios: 'Netter, lám. S-137',
        Código: 'T-A1-S3-01-o01.1',
      },
      [0, 1],
    ),
  ];
  return p;
};

async function publish(p: Parts) {
  const { bundle, media } = bundleOf(p);
  const b = ContentBundle.parse({
    ...bundle,
    ankiNoteTypes: [BASIC, CLOZE, OCCLUSION],
  });
  await published.save(b, media, { notes: true, decks: true, tests: true, unpublished: [] });
  await db.query('select public.reset_draft()');
}

/** Changes a draft note's fields (and its hash and front, as an import would). */
async function setDraftNote(guid: string, fields: Record<string, string>, front?: string) {
  await q(
    `update draft.anki_notes set fields = fields || $2::jsonb, hash = hash || '+' where guid = $1`,
    [guid, JSON.stringify(fields)],
  );
  if (front !== undefined) {
    await q(`update draft.anki_cards set front_html = $2 where note_guid = $1`, [guid, front]);
  }
}

describe('what the draft changes', () => {
  beforeEach(async () => {
    db = await createDatabase('content');
    await publish(BASE());
  });

  it('a draft equal to what is published changes nothing', async () => {
    const s = await summary();
    expect(s).toMatchObject({ assessments: [], catalog: [], noteTypes: [], presets: [] });
    expect(s.findings.filter((f) => f.rule !== 'class_without_year')).toEqual([]);
    expect(
      buildReview({
        summary: s,
        supportedSchemaVersion: 1,
        missingImages: [],
        phrases: [],
        today: '2026-11-07',
      }).empty,
    ).toBe(true);
  });

  it('classifies the cards: answer, no answer and format, by the fields that changed', async () => {
    await setDraftNote('001', { Extra: 'Contando el atlas y el axis.' }); // no_answer
    await setDraftNote('003', { Reverso: 'Siete' }); // answer, though the version did not go up
    await setDraftNote('004', { Reverso: '<b>7</b>', Extra: 'Contando&nbsp;el  atlas.' }); // format
    await setDraftNote('005', { Código: 'T-A1-S3-01-005.2', Actualización: '7-11-2026' }); // no_answer
    await setDraftNote('006', { Imagen: '<img src="otra.png">' }); // the image behind the answer: no_answer
    // The image of a question that shows it on the front («En la imagen de abajo…»): its front changes too.
    await setDraftNote(
      '002',
      { Imagen: '<img src="otra.png">' },
      '<div>En la imagen de abajo, ¿qué vértebra es?<img data-media="cards/otra.webp"></div>',
    );
    await setDraftNote('c01', { Extra: 'Más contexto' }); // no_answer, both cards
    await setDraftNote('o01', { Comentarios: 'Netter 8.ª ed., lám. S-137' }); // no_answer
    const s = await summary();
    expect(of(s, AN).cards).toEqual({
      added: 0,
      removed: 0,
      moved: 0,
      answer: 2,
      noAnswer: 7,
      format: 1,
      notes: 8,
    });
    const byGuid = Object.fromEntries(
      (await items(AN, 'card')).items.map((i) => [i.guid, [i.classification, i.changedFields]]),
    );
    expect(byGuid).toEqual({
      '001': ['no_answer', ['Extra']],
      '002': ['answer', ['Imagen']],
      '003': ['answer', ['Reverso']],
      '004': ['format', []],
      '005': ['no_answer', ['Actualización', 'Código']],
      '006': ['no_answer', ['Imagen']],
      c01: ['no_answer', ['Extra']],
      o01: ['no_answer', ['Comentarios']],
    });
  });

  it('ante la duda, puede cambiar: an unknown field, another note type, the image of an occlusion, a template', async () => {
    await setDraftNote('001', { Pista: 'Empieza con 7' });
    await q(`update draft.anki_notes set note_type_id = $2, hash = hash || '+' where guid = $1`, [
      '003',
      CLOZE.id,
    ]);
    await setDraftNote('o01', { Imagen: '<img src="otra-lamina.png">' });
    // A template that changed: notes with the same fields can ask another thing.
    await q(`update draft.anki_note_types set templates = $1 where id = $2`, [
      JSON.stringify([{ name: 'Directa', qfmt: '{{Reverso}}', afmt: '{{Frente}}' }]),
      BASIC.id,
    ]);
    await q(`update draft.anki_notes set hash = hash || '+' where guid = '004'`);
    const byGuid = Object.fromEntries(
      (await items(AN, 'card')).items.map((i) => [i.guid, i.classification]),
    );
    expect(byGuid).toEqual({ '001': 'answer', '003': 'answer', '004': 'answer', o01: 'answer' });
    expect((await summary()).noteTypes).toEqual([
      { id: BASIC.id, name: BASIC.name, op: 'changed' },
    ]);
  });

  it('Revisión de cero (1.7, parte 2): an image redrawn with the same name, and a change no field explains', async () => {
    const card = (guid: string, side: 'front_html' | 'back_html', html: string) =>
      q(`update draft.anki_cards set ${side} = $2 where note_guid = $1`, [guid, html]);
    const touch = (guid: string) =>
      q(`update draft.anki_notes set hash = hash || '+' where guid = $1`, [guid]);
    // The occlusion's image redrawn (its store key is the hash of the image), its field the same; and a source.
    await q(`update public.anki_cards set front_html = front_html || '<img data-media="cards/vieja.webp">'
              where note_guid in ('o01', '002')`);
    await q(`update draft.anki_cards set front_html = front_html || '<img data-media="cards/nueva.webp">'
              where note_guid = 'o01'`);
    await setDraftNote('o01', { Comentarios: 'Netter 8.ª ed., lám. S-137' });
    // A basic card that shows its image on the front: redrawn, with only the source changed.
    await q(`update draft.anki_cards set front_html = front_html || '<img data-media="cards/nueva.webp">'
              where note_guid = '002'`);
    await setDraftNote('002', { Fuente: 'Netter 8.ª ed.' });
    // No field changed, but the back shows another image (or another answer): nothing explains it.
    await card(
      '001',
      'back_html',
      '<div>¿Cuántas vértebras cervicales hay? 7 <img data-media="cards/x.webp"></div>',
    );
    await touch('001');
    await card('003', 'back_html', '<div>¿Cuántas vértebras cervicales hay? 8</div>');
    await touch('003');
    // Only another deck, or the same text written otherwise: still «format».
    await q(`update draft.anki_cards set deck_id = $1 where note_guid = '004'`, [leafOf(BC)]);
    await touch('004');
    await card('005', 'back_html', `<div><b>${'¿Cuántas vértebras cervicales hay?'}</b></div>`);
    await q(`update public.anki_cards set back_html = '<div>¿Cuántas vértebras cervicales hay?</div>'
              where note_guid = '005'`);
    await touch('005');
    const byGuid = Object.fromEntries(
      [...(await items(AN, 'card')).items, ...(await items(BC, 'card')).items].map((i) => [
        i.guid,
        i.classification,
      ]),
    );
    expect(byGuid).toEqual({
      '001': 'answer',
      '002': 'answer',
      '003': 'answer',
      '004': 'format',
      '005': 'format',
      o01: 'answer',
    });
    // The same in the summary (classified apart from the pages).
    expect(of(await summary(), AN).cards).toMatchObject({ answer: 5, format: 1 });
  });

  it('Revisión de cero (1.7, parte 2): what a reader sees, with images in any quotes and a loose «<»', async () => {
    const text = async (html: string) =>
      (await q<{ r: string }>('select public.release_text($1) as r', [html]))[0]!.r;
    expect(await text(`<img src='a.png'> x`)).toBe('[img a.png] x');
    expect(await text('<IMG class="x" SRC=b.png> x')).toBe('[img b.png] x');
    expect(await text('<img src="c.png" data-media="cards/c.webp">')).toBe('[img cards/c.webp]');
    expect(await text('p<0.05 y q>1 <b>z</b><!-- nota -->')).toBe('p<0.05 y q>1 z');
    expect(await text('a&nbsp;&lt;b&gt;</p><br/>c')).toBe('a <b> c');
    // A change inside a loose «<» is a change.
    await setDraftNote('003', { Reverso: 'p<0.01 y q>1' });
    await q(
      `update public.anki_notes set fields = fields || '{"Reverso": "p<0.05 y q>1"}' where guid = '003'`,
    );
    expect((await items(AN, 'card')).items.map((i) => [i.guid, i.classification])).toEqual([
      ['003', 'answer'],
    ]);
  });

  it('cards added, removed and moved, with their decks and how many each deck has', async () => {
    await q(`delete from draft.anki_notes where guid = '006'`);
    await q(
      `insert into draft.anki_notes (guid, note_type_id, fields, tags, code, version, hash)
       select '007', note_type_id, fields, tags, 'T-A1-S3-01-007', 1, 'nuevo' from draft.anki_notes where guid = '005'`,
    );
    await q(
      `insert into draft.anki_cards (note_guid, ord, deck_id, front_html, back_html, sort_field)
       values ('007', 0, $1, '<p>Nueva</p>', '<p>Nueva</p>', 'Nueva')`,
      [leafOf(AN)],
    );
    // To another deck (the one of the other assessment, for the test).
    await q(`update draft.anki_cards set deck_id = $1 where note_guid = '005'`, [leafOf(BC)]);
    const s = await summary();
    expect(of(s, AN).cards).toMatchObject({ added: 1, removed: 1, moved: 0 });
    expect(of(s, BC).cards).toMatchObject({ moved: 1 });
    expect(of(s, AN).decks).toEqual([
      expect.objectContaining({ id: leafOf(AN), op: 'changed', cardsBefore: 10, cardsAfter: 9 }),
    ]);
    const moved = (await items(BC, 'card')).items.find((i) => i.guid === '005')!;
    expect(moved.cards).toEqual([
      expect.objectContaining({
        ord: 0,
        op: 'moved',
        deckBefore: leafOf(AN),
        deckAfter: leafOf(BC),
      }),
    ]);
  });

  it('classifies the questions, and lists apart the ones whose key changed', async () => {
    const doc = async (id: string, change: string) =>
      q(
        `update draft.quiz_questions set document = ${change} where quiz_id = 'practica-bc' and id = $1`,
        [id],
      );
    // Fixtures: practica-bc-q1 «¿Uno?», practica-bc-q2 «¿Dos?», options a/b, correct 0.
    await doc('practica-bc-q1', `document || '{"correct": 1}'`);
    await doc('practica-bc-q2', `document || '{"explanation": "Porque sí."}'`);
    await q(`update draft.quiz_questions set document = document || '{"options": ["<b>a</b>", "b"]}'
              where quiz_id = 'practica-an' and id = 'practica-an-q1'`);
    const s = await summary();
    expect(of(s, BC).questions).toEqual({
      added: 0,
      removed: 0,
      answer: 1,
      noAnswer: 1,
      format: 0,
      moved: 0,
      keyChanged: 1,
      total: 2,
    });
    expect(of(s, AN).questions).toMatchObject({ format: 1, answer: 0 });
    const byId = Object.fromEntries(
      (await items(BC, 'question')).items.map((i) => [i.id, [i.classification, i.keyChanged]]),
    );
    expect(byId).toEqual({
      'practica-bc-q1': ['answer', true],
      'practica-bc-q2': ['no_answer', false],
    });
  });

  it('a question: its prompt, a drawing or a caption, and a move to another topic', async () => {
    const cls = async (before: object, after: object) =>
      (
        await q<{ r: string }>('select public.release_question_class($1, $2) as r', [
          JSON.stringify(before),
          JSON.stringify(after),
        ])
      )[0]!.r;
    const base = { kind: 'choice', prompt: '¿Uno?', options: ['a', 'b'], correct: 0 };
    const svg = { kind: 'svg', svg: '<svg><rect width="1"/></svg>', caption: 'Recreada' };
    expect(await cls(base, { ...base, prompt: '¿Uno solo?' })).toBe('answer');
    expect(await cls(base, { ...base, context: 'Un caso.' })).toBe('answer');
    expect(
      await cls({ ...base, figures: [svg] }, { ...base, figures: [{ ...svg, caption: 'Otra' }] }),
    ).toBe('no_answer');
    expect(
      await cls(
        { ...base, figures: [svg] },
        { ...base, figures: [{ ...svg, svg: '<svg><rect width="2"/></svg>' }] },
      ),
    ).toBe('answer');
    expect(await cls(base, { ...base, origin: 'Certamen 2021' })).toBe('no_answer');
    // Revisión de cero (1.7, parte 2): shuffling «todas las anteriores» can change which one is right.
    expect(await cls({ ...base, fixedOrder: true }, { ...base, fixedOrder: false })).toBe('answer');
    expect(await cls(base, { ...base, figureBeside: true })).toBe('no_answer');
    expect(await cls(base, { ...base, prompt: '<p>¿Uno?</p>' })).toBe('format');
    expect(
      await cls(
        { kind: 'short', prompt: 'x', answer: 'A' },
        { kind: 'short', prompt: 'x', answer: 'B' },
      ),
    ).toBe('answer');
    await q(
      `update draft.quiz_questions set group_id = '02' where quiz_id = 'practica-bc' and id = 'practica-bc-q1'`,
    );
    expect(of(await summary(), BC).questions).toMatchObject({ moved: 1 });
  });

  it('articles: the sections that changed, and «format» when what the reader sees did not', async () => {
    const p = BASE();
    p.notes[0] = article('AP-BC-C2-08', BC, 'Transcripción corregida', 1);
    // The same visible text (its version hash), another hash: «Ponte a prueba» moved, for example.
    p.notes[1] = { ...p.notes[1]!, hash: 'otro' };
    const { bundle, media } = bundleOf(p);
    await draft.save(
      ContentBundle.parse({ ...bundle, ankiNoteTypes: [BASIC, CLOZE, OCCLUSION] }),
      media,
    );
    const s = await summary();
    expect(of(s, BC).articles).toEqual({ added: 0, removed: 0, content: 1, format: 1 });
    const page = await items(BC, 'article');
    expect(page.items.map((i) => [i.id, i.classification])).toEqual([
      ['AP-BC-C2-08', 'content'],
      ['AP-BC-C2-09', 'format'],
    ]);
    expect(page.items[0]!.sections).toEqual([
      {
        anchor: '',
        title: 'Clase 1',
        op: 'changed',
        before: 'Transcripción',
        after: 'Transcripción corregida',
      },
    ]);
  });

  it('pages: the items and the texts go by key, with `next`', async () => {
    for (const g of ['001', '002', '003', '004', '005']) await setDraftNote(g, { Extra: 'otra' });
    const first = await items(AN, 'card', null, 2);
    expect(first.items.map((i) => i.guid)).toEqual(['001', '002']);
    expect(first.next).toBe('002');
    const second = await items(AN, 'card', first.next, 2);
    expect(second.items.map((i) => i.guid)).toEqual(['003', '004']);
    const last = await items(AN, 'card', second.next, 2);
    expect(last).toEqual({ items: [expect.objectContaining({ guid: '005' })], next: null });

    const p = BASE();
    p.notes[0] = article('AP-BC-C2-08', BC, 'Transcripción corregida', 1);
    p.notes[2] = article('AP-A1-S3-01', AN, 'Columna vertebral', 1);
    const { bundle, media } = bundleOf(p);
    await draft.save(
      ContentBundle.parse({ ...bundle, ankiNoteTypes: [BASIC, CLOZE, OCCLUSION] }),
      media,
    );
    const texts = (
      await service<{ r: { items: { key: string; text: string }[]; next: string | null } }>(
        'select public.release_texts(null, 3) as r',
      )
    )[0]!.r;
    expect(texts.items.map((t) => t.key)).toEqual([
      'a:AP-A1-S3-01#',
      'a:AP-A1-S3-01#00000',
      'a:AP-BC-C2-08#',
    ]);
    expect(texts.next).toBe('a:AP-BC-C2-08#');
    expect(texts.items[1]!.text).toBe('Clase 1 · Columna vertebral');
  });

  it('the images: only the new ones of what the draft adds or changes', async () => {
    await q(`update draft.anki_cards set back_html = back_html || '<img data-media="cards/nueva.webp">'
              where note_guid = '001'`);
    await q(`update draft.anki_notes set hash = hash || '+' where guid = '001'`);
    // Already in the published version of the same note: not asked again.
    await q(`update public.anki_cards set back_html = back_html || '<img data-media="cards/vieja.webp">'
              where note_guid = '003'`);
    await q(`update draft.anki_cards set back_html = back_html || '<img data-media="cards/vieja.webp">'
                                                   || '<img data-media="cards/otra.webp">' where note_guid = '003'`);
    await q(`update draft.anki_notes set hash = hash || '+' where guid = '003'`);
    const r = (await service<{ r: unknown }>('select public.release_media(null, 200) as r'))[0]!.r;
    expect(r).toEqual({ keys: ['cards/nueva.webp', 'cards/otra.webp'], next: null });
  });

  it('reads only: neither public nor the draft change', async () => {
    await setDraftNote('003', { Reverso: 'Siete' });
    const dump = async (schema: string) =>
      (
        await q<{ r: string }>(
          `select string_agg(t, '|' order by t) as r from (
             select table_name || ':' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text as t
               from information_schema.tables where table_schema = $1) x`,
          [schema],
        )
      )[0]!.r;
    const before = [await dump('public'), await dump('draft')];
    await summary();
    await items(AN, 'card');
    await service('select public.release_texts(null, 50), public.release_media(null, 50)');
    expect([await dump('public'), await dump('draft')]).toEqual(before);
  });
});

describe('the fingerprint and the marks by hand', () => {
  beforeEach(async () => {
    db = await createDatabase('content');
    await publish(BASE());
  });

  it('changes with the content, not with an import that only moves dates', async () => {
    const a = await fingerprint();
    // Importing the same again (the import's dates change): the same fingerprint.
    await q(
      `update draft.notes set updated_at = now() + interval '1 day', version = version + 1, version_at = now()`,
    );
    await q(`update draft.anki_notes set updated_at = now() + interval '1 day'`);
    expect(await fingerprint()).toBe(a);
    await setDraftNote('003', { Reverso: 'Siete' });
    const b = await fingerprint();
    expect(b).not.toBe(a);
    await q(`update draft.anki_cards set deck_id = $1 where note_guid = '001'`, [leafOf(BC)]);
    expect(await fingerprint()).not.toBe(b);
    await db.query('select public.reset_draft()');
    expect(await fingerprint()).toBe(a);
  });

  it('Revisión de cero (1.7, parte 2): changes when only what is published does (the difference is another)', async () => {
    const a = await fingerprint();
    // `--target cloud` or an emergency unpublish wrote in public, not in the draft.
    await q(
      `update public.anki_notes set fields = fields || '{"Reverso": "8"}', hash = hash || '+' where guid = '003'`,
    );
    const b = await fingerprint();
    expect(b).not.toBe(a);
    await q(`update public.anki_decks set preset = null where id = $1`, [ROOT]);
    expect(await fingerprint()).not.toBe(b);
  });

  it('Revisión de cero (1.7, parte 2): the decks above the assessments are in the summary, and their preset warns', async () => {
    await q(`update draft.anki_decks set preset = null where id = $1`, [ROOT]);
    const s = await summary();
    expect(s.assessments).toEqual([]);
    expect(s.decks).toEqual([
      expect.objectContaining({
        id: ROOT,
        op: 'changed',
        presetBefore: 'Default',
        presetAfter: null,
      }),
    ]);
    const r = buildReview({
      summary: s,
      supportedSchemaVersion: 1,
      missingImages: [],
      phrases: [],
      today: '2026-11-07',
    });
    expect(r.empty).toBe(false);
    expect(r.checks.find((c) => c.rule === 'preset_changed')!.items.map((i) => i.key)).toEqual([
      `deck:${ROOT}`,
    ]);
  });

  it('a mark is for the draft it was made for: if the draft changes, it is asked again', async () => {
    const fp = await fingerprint();
    const set = (f: string, mark: string, checked: boolean) =>
      service<{ r: unknown }>('select public.set_release_mark($1, $2, $3, $4) as r', [
        f,
        mark,
        checked,
        'dueno@ug.uchile.cl',
      ]);
    expect((await set(fp, 'phone', true))[0]!.r).toEqual([
      expect.objectContaining({ mark: 'phone', checkedBy: 'dueno@ug.uchile.cl' }),
    ]);
    expect((await summary()).marks.map((m) => m.mark)).toEqual(['phone']);
    await setDraftNote('003', { Reverso: 'Siete' });
    // The draft changed: the old mark does not count, and the old fingerprint is refused.
    expect((await summary()).marks).toEqual([]);
    await expect(set(fp, 'answers', true)).rejects.toThrow(/the draft changed/);
    const now = await fingerprint();
    await set(now, 'answers', true);
    await set(now, 'answers', false);
    expect((await summary()).marks).toEqual([]);
  });
});

describe('what the review list needs from the database', () => {
  beforeEach(async () => {
    db = await createDatabase('content');
    await publish(BASE());
  });
  const rules = async (rule: string) => (await summary()).findings.filter((f) => f.rule === rule);

  it('the package version and the list of content/unpublished.json come with the catalog (sync_catalog)', async () => {
    const { bundle, media } = bundleOf(BASE());
    const publicMeta = await q(`select * from public.content_meta order by key`);
    await draft.save(
      ContentBundle.parse({ ...bundle, ankiNoteTypes: [BASIC, CLOZE, OCCLUSION] }),
      media,
      {
        notes: true,
        decks: true,
        tests: true,
        unpublished: [{ kind: 'note', id: 'AP-BC-C2-09' }],
      },
    );
    const s = await summary();
    expect(s.schemaVersion).toBe(1);
    expect(s.unpublished).toEqual([{ kind: 'note', id: 'AP-BC-C2-09' }]);
    // The article is still in the draft (an import that did not bring that assessment, for example): it stops.
    expect(await rules('unpublished_in_draft')).toEqual([
      expect.objectContaining({ key: 'AP-BC-C2-09', detail: { kind: 'note', title: 'Clase 2' } }),
    ]);
    // An older importer (without meta) changes nothing of it.
    await service(`select draft.sync_catalog($1::jsonb)`, [
      JSON.stringify({
        semesters: bundle.semesters,
        courses: bundle.courses,
        assessments: bundle.assessments,
      }),
    ]);
    expect((await summary()).unpublished).toEqual([{ kind: 'note', id: 'AP-BC-C2-09' }]);
    // Public is not touched by an import to the draft.
    expect(await q(`select * from public.content_meta order by key`)).toEqual(publicMeta);
    expect(publicMeta.map((m) => [m.key, m.value])).toEqual([
      ['schema_version', 1],
      ['unpublished', []],
    ]);
  });

  it('something of the list that is a test, a deck or an image', async () => {
    await q(`update draft.content_meta set value = $1 where key = 'unpublished'`, [
      JSON.stringify([
        { kind: 'quiz', id: 'practica-bc' },
        { kind: 'deck', id: leafOf(AN) },
        { kind: 'image', id: 'cards/en-uso.webp' },
        { kind: 'image', id: 'cards/ya-no.webp' },
      ]),
    ]);
    await q(`update draft.anki_cards set back_html = back_html || '<img data-media="cards/en-uso.webp">'
              where note_guid = '001'`);
    expect((await rules('unpublished_in_draft')).map((f) => [f.detail.kind, f.key])).toEqual([
      ['deck', leafOf(AN)],
      ['image', 'cards/en-uso.webp'],
      ['quiz', 'practica-bc'],
    ]);
  });

  it('a key out of range, a lecture without its year, IMAIOS', async () => {
    await q(
      `update draft.quiz_questions set document = document || '{"correct": 2}' where id = 'practica-bc-q1'`,
    );
    await q(
      `update draft.quiz_questions set document = document || '{"correct": 1.5}' where id = 'practica-bc-q2'`,
    );
    expect((await rules('key_out_of_range')).map((f) => f.key)).toEqual([
      'practica-bc/practica-bc-q1',
      'practica-bc/practica-bc-q2',
    ]);
    // The fixtures' articles have no header: every lecture is without its year. With it, none.
    expect((await rules('class_without_year')).map((f) => f.key)).toEqual([
      'AP-A1-S3-01',
      'AP-BC-C2-08',
      'AP-BC-C2-09',
    ]);
    await q(
      `update draft.notes set document = document || '{"header": {"term": "spring", "year": 2026}}'`,
    );
    await q(`update draft.notes set kind = 'summary' where id = 'AP-BC-C2-09'`);
    expect(await rules('class_without_year')).toEqual([]);
    await setDraftNote('001', { Fuente: 'IMAIOS e-Anatomy' });
    expect((await rules('imaios')).map((f) => f.key)).toEqual(['001']);
    // Revisión de cero (1.7, parte 2): a question, a test and a deck that name it too.
    await q(`update draft.quiz_questions set document = document || '{"explanation": "Corte de IMAIOS."}'
              where id = 'practica-an-q1'`);
    await q(
      `update draft.quizzes set title = 'Cortes (IMAIOS)', hash = hash || '+' where id = 'practica-bc'`,
    );
    await q(`update draft.anki_decks set name = name || ' (IMAIOS)' where id = $1`, [leafOf(BC)]);
    expect((await rules('imaios')).map((f) => f.key).sort()).toEqual(
      ['001', leafOf(BC), 'practica-an/practica-an-q1', 'practica-bc'].sort(),
    );
  });

  it('«Ponte a prueba» that points to a test, a tab, a topic or a deck the draft does not have', async () => {
    const practice = async (id: string, p: object) =>
      q(
        `update draft.notes set document = jsonb_set(document, '{practice}', $2::jsonb) where id = $1`,
        [id, JSON.stringify(p)],
      );
    await practice('AP-BC-C2-08', { quizId: 'practica-bc', section: 'all', groups: ['01'] });
    expect(await rules('practice_broken')).toEqual([]);
    await practice('AP-BC-C2-08', { quizId: 'no-existe' });
    await practice('AP-BC-C2-09', { section: 'otra', groups: ['09'], deck: '02 - Otro tema' });
    await practice('AP-A1-S3-01', { deck: '01 - Tema' });
    expect(
      (await rules('practice_broken')).map((f) => [f.key, f.detail.what, f.detail.value]),
    ).toEqual([
      ['AP-BC-C2-08', 'quiz', 'no-existe'],
      ['AP-BC-C2-09', 'deck', '02 - Otro tema'],
      ['AP-BC-C2-09', 'group', '09'],
      ['AP-BC-C2-09', 'section', 'otra'],
    ]);
  });

  it('a question id that moved to another text, or a text that came back with another id', async () => {
    // q1 now has q2's text (the ids slid by one).
    await q(`update draft.quiz_questions set document = document || '{"prompt": "¿Dos?"}'
              where quiz_id = 'practica-bc' and id = 'practica-bc-q1'`);
    expect((await rules('question_id_shifted')).map((f) => [f.key, f.detail])).toEqual([
      ['practica-bc/practica-bc-q1', { kind: 'shifted', other: 'practica-bc-q2' }],
    ]);
    await db.query('select public.reset_draft()');
    // q2 removed and its text again as q9.
    await q(`update draft.quiz_questions set id = 'practica-bc-q9', document = document || '{"id": "practica-bc-q9"}'
              where quiz_id = 'practica-bc' and id = 'practica-bc-q2'`);
    expect((await rules('question_id_shifted')).map((f) => [f.key, f.detail])).toEqual([
      ['practica-bc/practica-bc-q9', { kind: 'renamed', other: 'practica-bc-q2' }],
    ]);
  });

  it('notes removed and added in the same assessment, for the changed GUIDs', async () => {
    // 003 with a new GUID (the same code), and 006 removed with a new unrelated one.
    await q(`update draft.anki_notes set guid = '003-nuevo' where guid = '003'`).catch(
      () => undefined,
    );
    await q(`insert into draft.anki_notes (guid, note_type_id, fields, tags, code, version, hash)
             select '003-nuevo', note_type_id, fields, tags, code, version, hash from draft.anki_notes where guid = '003'`);
    await q(`update draft.anki_cards set note_guid = '003-nuevo' where note_guid = '003'`);
    await q(`delete from draft.anki_notes where guid = '003'`);
    const [f] = await rules('guid_candidates');
    expect(f).toMatchObject({ assessmentId: AN });
    expect(f!.detail).toEqual({
      removed: [
        { guid: '003', code: 'T-A1-S3-01-003', text: '¿Cuántas vértebras cervicales hay?' },
      ],
      added: [
        { guid: '003-nuevo', code: 'T-A1-S3-01-003', text: '¿Cuántas vértebras cervicales hay?' },
      ],
      removedTotal: 1,
      addedTotal: 1,
    });
    // Revisión de cero (1.7, parte 2): the same code, found by the database without the limit of the candidates.
    expect((await rules('guid_same_code')).map((g) => [g.key, g.assessmentId])).toEqual([
      ['003>003-nuevo', AN],
    ]);
  });

  it('Revisión de cero (1.7, parte 2): the same code beyond the 300 candidates, and how many there were', async () => {
    // 310 notes out and 310 in (other GUIDs, other texts), and among them 003 with a new GUID and its code.
    await q(`insert into public.anki_notes (guid, note_type_id, fields, tags, code, version, hash)
             select 'a' || lpad(i::text, 4, '0'), note_type_id, jsonb_build_object('Frente', 'Vieja ' || i), tags,
                    'T-X-' || i, 1, 'h' || i
               from public.anki_notes, generate_series(1, 310) i where guid = '001'`);
    await q(
      `insert into public.anki_cards (note_guid, ord, deck_id, front_html, back_html, sort_field)
             select 'a' || lpad(i::text, 4, '0'), 0, $1, 'v', 'v', 'v' from generate_series(1, 310) i`,
      [leafOf(AN)],
    );
    await q(`insert into draft.anki_notes (guid, note_type_id, fields, tags, code, version, hash)
             select 'z' || lpad(i::text, 4, '0'), note_type_id, jsonb_build_object('Frente', 'Nueva ' || i), tags,
                    'T-Y-' || i, 1, 'n' || i
               from draft.anki_notes, generate_series(1, 310) i where guid = '001'`);
    await q(
      `insert into draft.anki_cards (note_guid, ord, deck_id, front_html, back_html, sort_field)
             select 'z' || lpad(i::text, 4, '0'), 0, $1, 'n', 'n', 'n' from generate_series(1, 310) i`,
      [leafOf(AN)],
    );
    await q(`insert into draft.anki_notes (guid, note_type_id, fields, tags, code, version, hash)
             select 'zzzz-003', note_type_id, fields, tags, 'T-A1-S3-01-003', 2, hash || '+' from draft.anki_notes
              where guid = '003'`);
    await q(`update draft.anki_cards set note_guid = 'zzzz-003' where note_guid = '003'`);
    await q(`delete from draft.anki_notes where guid = '003'`);
    const [f] = await rules('guid_candidates');
    expect([
      (f!.detail.removed as unknown[]).length,
      (f!.detail.added as unknown[]).length,
      f!.detail.removedTotal,
      f!.detail.addedTotal,
    ]).toEqual([300, 300, 311, 311]);
    // 003 is the last of the added (by GUID): not among the 300 candidates, but found by its code.
    expect((await rules('guid_same_code')).map((g) => g.key)).toEqual(['003>zzzz-003']);
    const review = buildReview({
      summary: await summary(),
      supportedSchemaVersion: 1,
      missingImages: [],
      phrases: [],
      today: '2026-11-07',
    });
    const items = (rule: string) => review.checks.find((c) => c.rule === rule)!.items;
    expect(items('guid_changed').map((i) => i.key)).toEqual(['003>zzzz-003']);
    expect(items('guid_maybe').map((i) => i.text)).toContainEqual(
      expect.stringMatching(
        /salen 311 notas y entran 311; el texto se comparó solo en las primeras 300 y 300/,
      ),
    );
  });

  it('what each cloze and mask asks, before and after, when it is not the same', async () => {
    await setDraftNote('c01', {
      Texto: 'La columna tiene {{c1::12}} torácicas y {{c2::7}} cervicales.',
    });
    await setDraftNote('o01', { Oclusión: `${rect(1, 0.5, 0.5)}<br>${rect(2, 0.1, 0.1)}` });
    await setDraftNote('001', { Extra: 'otra' }); // not a cloze: nothing
    const found = Object.fromEntries(
      (await rules('cloze_signatures')).map((f) => [f.key, f.detail]),
    );
    expect(found).toEqual({
      c01: {
        code: 'T-A1-S3-01-c01',
        occlusion: false,
        before: { 0: '7', 1: '12' },
        after: { 0: '12', 1: '7' },
      },
      o01: {
        code: 'T-A1-S3-01-o01',
        occlusion: true,
        before: {
          0: 'rect:left=0.1:top=0.1:width=.1000:height=.0500',
          1: 'rect:left=0.5:top=0.5:width=.1000:height=.0500',
        },
        after: {
          0: 'rect:left=0.5:top=0.5:width=.1000:height=.0500',
          1: 'rect:left=0.1:top=0.1:width=.1000:height=.0500',
        },
      },
    });
  });
});

describe('who reaches the review tools', () => {
  it('only service_role, and the marks only through set_release_mark(); the draft has none of them', async () => {
    db = await createDatabase('content');
    for (const role of ['anon', 'authenticated']) {
      await expect(
        db.transaction(async (tx) => {
          await tx.exec(`set local role ${role}`);
          await tx.query('select public.release_summary()');
        }),
      ).rejects.toThrow(/permission denied/);
    }
    await expect(
      service(
        `insert into public.release_marks (fingerprint, mark, checked_by) values (repeat('a', 32), 'phone', 'x')`,
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(service('select public.release_text($1)', ['x'])).rejects.toThrow(
      /permission denied/,
    );
    expect(
      await q(
        `select proname from pg_proc where pronamespace = 'draft'::regnamespace and proname like 'release%'`,
      ),
    ).toEqual([]);
    expect(
      await q(
        `select relname from pg_class where relnamespace = 'draft'::regnamespace and relname = 'release_marks'`,
      ),
    ).toEqual([]);
    // content_meta is content: the draft has its own.
    expect(
      await q(
        `select relname from pg_class where relnamespace = 'draft'::regnamespace and relname = 'content_meta'`,
      ),
    ).toHaveLength(1);
    expect(await q('select * from public.draft_drift()')).toEqual([]);
  });

  it('the users’ impact: only for an administrator, by deck, with the seen and turned-on counts', async () => {
    const users = await createDatabase('users');
    const admin = { sub: '00000000-0000-4000-8000-000000000001', email: 'dueno@ug.uchile.cl' };
    const ana = { sub: '00000000-0000-4000-8000-000000000002', email: 'ana@ug.uchile.cl' };
    await users.query(
      `insert into public.invited_emails (email, list) values ($1, 'Equipo'), ($2, 'Equipo') on conflict do nothing`,
      [admin.email, ana.email],
    );
    for (const u of [admin, ana]) {
      await users.query(`insert into auth.users (id, email) values ($1, $2)`, [u.sub, u.email]);
    }
    await users.query(
      `insert into public.card_states (user_id, note_guid, ord, deck_id, phase, due, last_review, interday)
       values ($1, 'a', 0, '10', 'review', now(), now(), true), ($1, 'b', 0, '10', 'learning', now(), now(), false),
              ($2, 'a', 0, '10', 'new', null, null, false), ($2, 'c', 0, '20', 'review', now(), now(), true)`,
      [ana.sub, admin.sub],
    );
    await users.query(
      `insert into public.deck_activations (user_id, deck_id, active) values ($1, '10', true)`,
      [admin.sub],
    );
    await expect(
      asUser(users, ana, (tx) => tx.query(`select * from public.admin_deck_impact(array['10'])`)),
    ).rejects.toThrow(/Solo para administradores/);
    const r = await asUser(users, admin, (tx) =>
      tx.query(`select * from public.admin_deck_impact(array['10', '20', '30', 'x'])`),
    );
    expect(r.rows).toEqual([
      { deck_id: '10', students_seen: 1, cards_seen: 2, students_active: 1 },
      { deck_id: '20', students_seen: 1, cards_seen: 1, students_active: 0 },
      { deck_id: '30', students_seen: 0, cards_seen: 0, students_active: 0 },
    ]);
  });
});

// ────────────────────────── the e2e folder's release (what the demo serves) ──────────────────────────

const E2E = join(import.meta.dirname, '..', '..', 'apps', 'web', 'e2e', 'content');

describe('the e2e folder', () => {
  it('its release files are what the database gives for its content and its draft', async () => {
    db = await createDatabase('content');
    const bundleAt = (path: string) => ContentBundle.parse(JSON.parse(readFileSync(path, 'utf8')));
    const pub = bundleAt(join(E2E, 'content.json'));
    const dra = bundleAt(join(E2E, 'draft', 'content.json'));
    const media = (b: ContentBundle) =>
      new Map(
        [...b.notes, ...b.quizzes, ...b.ankiNotes]
          .flatMap((p) => p.media)
          .map((k) => [k, image(k)]),
      );
    await published.save(pub, media(pub));
    await db.query('select public.reset_draft()');
    await draft.save(dra, media(dra), { notes: true, decks: true, tests: true, unpublished: [] });
    const s = (
      await service<{ r: Record<string, unknown> }>('select public.release_summary() as r')
    )[0]!.r;
    const out: Record<string, unknown> = {};
    for (const a of (s.assessments as { id: string }[]).map((x) => x.id)) {
      for (const kind of ['card', 'article', 'question']) {
        out[`${a}|${kind}`] = (await items(a, kind, null, 500)).items;
      }
    }
    const texts = (
      await service<{ r: { items: unknown[] } }>('select public.release_texts(null, 1000) as r')
    )[0]!.r.items;
    const keys = (
      await service<{ r: { keys: unknown[] } }>('select public.release_media(null, 1000) as r')
    )[0]!.r.keys;
    const files: Record<string, unknown> = {
      'summary.json': s,
      'items.json': out,
      'texts.json': texts,
      'media.json': keys,
    };
    const folder = join(E2E, 'release');
    if (process.env.QV_WRITE_RELEASE_FIXTURES) {
      mkdirSync(folder, { recursive: true });
      for (const [name, value] of Object.entries(files)) {
        writeFileSync(join(folder, name), `${JSON.stringify(value, null, 2)}\n`);
      }
    }
    for (const [name, value] of Object.entries(files)) {
      const path = join(folder, name);
      expect(existsSync(path), `falta ${path}: QV_WRITE_RELEASE_FIXTURES=1`).toBe(true);
      expect(JSON.parse(readFileSync(path, 'utf8')), name).toEqual(
        JSON.parse(JSON.stringify(value)),
      );
    }
    // What the e2e draft brings, as the panel shows it.
    const summaryParsed = ReleaseSummary.parse(s);
    expect(of(summaryParsed, AN).cards).toMatchObject({
      added: 1,
      removed: 1,
      answer: 2,
      noAnswer: 3,
    });
    expect(of(summaryParsed, 'biologia-celular/certamen-2')).toMatchObject({
      articles: { content: 1 },
      questions: { answer: 1, noAnswer: 1, keyChanged: 1 },
    });
  });
});
