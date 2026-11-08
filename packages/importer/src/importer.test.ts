import { Assessment } from '@qv/schema';
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readApkgFile } from '@qv/anki-format';
import { ContentBundle } from '@qv/schema';
import { buildBundle, hash } from './build';
import { containerDeckId } from './decks';
import { sanitizeCard } from './card-html';
import { FolderTarget, batches, cardMoves, sharedConflicts } from './targets';
import { ImageCache, MAX_WIDTH, processCardImage, processImage } from './images';
import { readManifest, readUnpublished, validateReferences } from './manifest';
import { sameUnpublished } from './unpublished';
import { privateMaterial } from './private-folder';
import type { Manifest } from './manifest';

/** The private repository's content/ (step 2.4): its checks run where it is, and are skipped in the public CI. */
const PRIVATE = privateMaterial();
const privately = (name: string) =>
  PRIVATE.content ? name : `${name} (se salta: ${PRIVATE.skipReason})`;

let root: string;

const manifest: Manifest = {
  catalog: {
    semesters: [
      { number: 1, name: '1° Semestre' },
      { number: 2, name: '2° Semestre' },
    ],
    courses: [
      { id: 'anatomia-1', semester: 1, name: 'Anatomía I', emoji: '🦴', position: 1 },
      { id: 'biologia-celular', semester: 2, name: 'Biología celular', emoji: '🧬', position: 1 },
    ],
    assessments: [
      { id: 'anatomia-1/certamen-1', courseId: 'anatomia-1', name: 'Certamen 1', position: 1 },
      {
        id: 'biologia-celular/certamen-2',
        courseId: 'biologia-celular',
        name: 'Certamen 2',
        position: 2,
      },
    ],
  },
  notes: [
    {
      assessmentId: 'biologia-celular/certamen-2',
      notes: [
        {
          id: 'AP-BC-C2-11',
          code: 'QV-BC-C2-11',
          slug: '11-traduccion',
          kind: 'lecture',
          position: 1,
          title: 'Traducción',
          subtitle: 'Clase N.º 11',
          header: { number: '11', lecturer: 'Prof. Luis Ejemplo A.', term: 'spring', year: 2026 },
          sources: ['Fuentes: diapositivas'],
          practice: { deck: '11 - Traducción' },
          sourceFile: 'clase/apunte.md',
        },
        {
          id: 'AP-BC-C2-12',
          slug: '12-comunicacion',
          kind: 'lecture',
          position: 2,
          title: 'Comunicación',
          sources: [],
          sourceFile: 'otra/apunte.md',
        },
      ],
    },
  ],
  decks: [],
};

const SAMPLE = join(import.meta.dirname, '../../anki-format/test/fixtures/sample.apkg');

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'qv-importer-'));
  await mkdir(join(root, 'clase/imagenes'), { recursive: true });
  await mkdir(join(root, 'otra/img'), { recursive: true });
  await mkdir(join(root, 'mala'), { recursive: true });
  await mkdir(join(root, 'sem'), { recursive: true });
  const png = await sharp({
    create: { width: 2400, height: 1200, channels: 3, background: '#4a7890' },
  })
    .png()
    .toBuffer();
  await writeFile(join(root, 'clase/imagenes/ribosoma.png'), png);
  await writeFile(join(root, 'otra/img/misma.png'), png); // the same image under another name
  await writeFile(
    join(root, 'clase/apunte.md'),
    '# Traducción\n<!-- creado: 2026-09-30 -->\n\n## Ribosomas\n\n![Ribosoma](imagenes/ribosoma.png){50%}\n',
  );
  await writeFile(join(root, 'otra/apunte.md'), '# Comunicación\n\n![Igual](img/misma.png)\n');
  await mkdir(join(root, 'mazos'), { recursive: true });
  await copyFile(SAMPLE, join(root, 'mazos/Mazo de prueba.apkg'));
});

afterAll(() => rm(root, { recursive: true, force: true }));

const build = () =>
  buildBundle({
    manifest,
    root,
    process: processImage,
    now: () => new Date('2026-10-31T12:00:00Z'),
  });

describe('cardMoves', () => {
  it('counts the cards in another deck and those that are gone; the same deck is nothing', () => {
    const before = [
      {
        guid: 'a',
        cards: [
          { ord: 0, deckId: '1' },
          { ord: 1, deckId: '1' },
        ],
      },
      { guid: 'b', cards: [{ ord: 0, deckId: '1' }] },
    ];
    const after = [
      { guid: 'a', cards: [{ ord: 0, deckId: '2' }] },
      { guid: 'c', cards: [{ ord: 0, deckId: '1' }] },
    ];
    expect(cardMoves(before, after)).toEqual({ moved: 1, retired: 2 });
    expect(cardMoves(before, before)).toEqual({ moved: 0, retired: 0 });
  });
});

describe('the catalog', () => {
  const assessment = {
    id: 'anatomia-1/certamen-1',
    courseId: 'anatomia-1',
    name: 'C1',
    position: 1,
  };

  it('a date the author suggests is optional, and has to be a date', () => {
    expect(Assessment.parse(assessment).suggestedDate).toBeUndefined();
    expect(Assessment.parse({ ...assessment, suggestedDate: '2026-11-05' }).suggestedDate).toBe(
      '2026-11-05',
    );
    expect(() => Assessment.parse({ ...assessment, suggestedDate: '5 de noviembre' })).toThrow();
    // It would stop the import later, in the database.
    expect(() => Assessment.parse({ ...assessment, suggestedDate: '2026-02-31' })).toThrow();
  });
});

describe('buildBundle', () => {
  it('builds a valid bundle with the data of the manifest and of the note', async () => {
    const { bundle } = await build();
    expect(() => ContentBundle.parse(bundle)).not.toThrow();
    const [n] = bundle.notes;
    expect(n).toMatchObject({
      id: 'AP-BC-C2-11',
      courseId: 'biologia-celular',
      assessmentId: 'biologia-celular/certamen-2',
      title: 'Traducción',
      subtitle: 'Clase N.º 11',
      createdOn: '2026-09-30',
      toc: [{ anchor: 'ribosomas', title: 'Ribosomas', level: 2 }],
      updatedAt: '2026-10-31T12:00:00.000Z',
    });
    expect(n!.sections.map((s) => s.anchor)).toEqual(['ribosomas']);
  });

  it('shrinks the images, stores them by content and does not repeat the same one', async () => {
    const { bundle, media } = await build();
    expect(media.size).toBe(1);
    const [img] = [...media.values()];
    expect(img).toMatchObject({
      width: MAX_WIDTH,
      height: MAX_WIDTH / 2,
      contentType: 'image/webp',
    });
    expect(img!.key).toMatch(/^notes\/[0-9a-f]{32}\.webp$/);
    expect(bundle.notes[0]!.html).toContain(`data-media="${img!.key}"`);
    expect(bundle.notes[0]!.media).toEqual([img!.key]);
    expect(bundle.notes[1]!.media).toEqual([img!.key]);
  });

  it('stops with a clear error if an image is missing or a figure is not recognized', async () => {
    await writeFile(
      join(root, 'mala/articulo.md'),
      '## Uno\n\n![Falta](imagenes/no.png)\n\n![Con espacios](mis imagenes/a.png){40%}\n',
    );
    const bad: Manifest = structuredClone(manifest);
    bad.notes[0]!.notes[1]!.sourceFile = 'mala/articulo.md';
    const error = await buildBundle({ manifest: bad, root, process: processImage }).catch(
      (e: unknown) => e as Error,
    );
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toMatch(/^No se puede publicar: 2 problema/);
    expect(message).toContain('AP-BC-C2-12 (mala/articulo.md): no se encontró o no se pudo leer');
    expect(message).toContain('imagenes/no.png');
    expect(message).toContain(
      'AP-BC-C2-12 (mala/articulo.md): Figura que no se reconoce: «![Con espacios](mis imagenes/a.png){40%}»',
    );
  });

  it('a note with a web code carries it, its header, its links and a hash of what the reader sees', async () => {
    const { bundle } = await build();
    const [a, b] = bundle.notes;
    expect(a).toMatchObject({
      code: 'QV-BC-C2-11',
      header: { number: '11', lecturer: 'Prof. Luis Ejemplo A.', term: 'spring', year: 2026 },
      practice: { deck: '11 - Traducción' },
    });
    expect(a!.versionHash).toMatch(/^[0-9a-f]{64}$/);
    // The version is decided when saving, against what is published.
    expect(a!.version).toBeUndefined();
    // Without a web code there is no version.
    expect(b!.code).toBeUndefined();
    expect(b!.versionHash).toBeUndefined();
  });

  it('the hash of what the reader sees ignores the position and the links', async () => {
    const a = (await build()).bundle.notes[0]!;
    const moved: Manifest = structuredClone(manifest);
    moved.notes[0]!.notes[0]!.position = 7;
    moved.notes[0]!.notes[0]!.practice = { deck: 'Otro' };
    const b = (await buildBundle({ manifest: moved, root, process: processImage })).bundle
      .notes[0]!;
    expect(b.hash).not.toBe(a.hash);
    expect(b.versionHash).toBe(a.versionHash);
    const retitled: Manifest = structuredClone(manifest);
    retitled.notes[0]!.notes[0]!.header!.lecturer = 'Otra docente';
    const c = (await buildBundle({ manifest: retitled, root, process: processImage })).bundle
      .notes[0]!;
    expect(c.versionHash).not.toBe(a.versionHash);
  });

  it('a seminar turns the italic questions of its guide into question callouts', async () => {
    await writeFile(join(root, 'sem/articulo.md'), '*a) ¿Qué es?*\n\nEs esto.\n');
    const sem: Manifest = structuredClone(manifest);
    sem.notes[0]!.notes = [
      { ...sem.notes[0]!.notes[1]!, kind: 'seminar', sourceFile: 'sem/articulo.md' },
    ];
    const { bundle } = await buildBundle({ manifest: sem, root, process: processImage });
    expect(bundle.notes[0]!.html).toContain('callout-question');
  });

  it('the hash does not depend on the time and does not change if the note does not change', async () => {
    const a = (await build()).bundle.notes[0]!;
    const b = (await buildBundle({ manifest, root, process: processImage })).bundle.notes[0]!;
    expect(a.hash).toBe(b.hash);
    expect(hash({ x: 1, y: [2] })).toBe(hash({ y: [2], x: 1 }));
  });

  it('--only imports only those notes', async () => {
    const { bundle } = await buildBundle({
      manifest,
      root,
      process: processImage,
      only: ['AP-BC-C2-12'],
    });
    expect(bundle.notes.map((n) => n.id)).toEqual(['AP-BC-C2-12']);
  });
});

describe('FolderTarget', () => {
  it('writes content.json and the images, and keeps updatedAt if nothing changed', async () => {
    const output = join(root, '.output');
    const target = new FolderTarget(output);
    const first = await build();
    const r1 = await target.save(first.bundle, first.media);
    expect(r1).toMatchObject({
      changedNotes: ['AP-BC-C2-11', 'AP-BC-C2-12'],
      mediaUploaded: 1,
    });

    const second = await buildBundle({
      manifest,
      root,
      process: processImage,
      now: () => new Date('2026-11-01T00:00:00Z'),
    });
    const r2 = await target.save(second.bundle, second.media);
    expect(r2).toMatchObject({ changedNotes: [], mediaUploaded: 0, mediaExisting: 1 });

    const saved = ContentBundle.parse(
      JSON.parse(await readFile(join(output, 'content.json'), 'utf8')),
    );
    expect(saved.notes[0]!.updatedAt).toBe('2026-10-31T12:00:00.000Z');
    const key = saved.notes[0]!.media[0]!;
    expect((await readFile(join(output, 'media', key))).length).toBeGreaterThan(0);
  });

  it('gives the article its version and dates: the same on a second import, the next one if it changes', async () => {
    const output = join(root, '.output-versions');
    const target = new FolderTarget(output);
    const at = (iso: string, m: Manifest = manifest) =>
      buildBundle({ manifest: m, root, process: processImage, now: () => new Date(iso) });
    const read = async () =>
      ContentBundle.parse(JSON.parse(await readFile(join(output, 'content.json'), 'utf8'))).notes;

    const first = await at('2026-11-01T10:00:00Z');
    await target.save(first.bundle, first.media);
    const [firstNote, b] = await read();
    let a = firstNote;
    expect(a).toMatchObject({
      version: 1,
      publishedAt: '2026-11-01T10:00:00.000Z',
      versionAt: '2026-11-01T10:00:00.000Z',
    });
    // Without a web code there is no version.
    expect(b!.version).toBeUndefined();

    // A second import without changes does not raise the version.
    const second = await at('2026-11-02T10:00:00Z');
    expect((await target.save(second.bundle, second.media)).changedNotes).toEqual([]);
    [a] = await read();
    expect(a).toMatchObject({ version: 1, versionAt: '2026-11-01T10:00:00.000Z' });

    // The links change: the note is saved, but the version stays.
    const links: Manifest = structuredClone(manifest);
    links.notes[0]!.notes[0]!.practice = { deck: 'Otro' };
    const third = await at('2026-11-03T10:00:00Z', links);
    expect((await target.save(third.bundle, third.media)).changedNotes).toEqual(['AP-BC-C2-11']);
    [a] = await read();
    expect(a).toMatchObject({
      version: 1,
      versionAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-03T10:00:00.000Z',
    });

    // What the reader sees changes: version 2, «Creado el» stays.
    const sources: Manifest = structuredClone(links);
    sources.notes[0]!.notes[0]!.sources = ['Clase 11 de 2026'];
    const fourth = await at('2026-11-04T10:00:00Z', sources);
    await target.save(fourth.bundle, fourth.media);
    [a] = await read();
    expect(a).toMatchObject({
      version: 2,
      publishedAt: '2026-11-01T10:00:00.000Z',
      versionAt: '2026-11-04T10:00:00.000Z',
    });
  });

  it('step 1.8: a note that changes assessment and gets a group keeps its id, slug, version and dates', async () => {
    const output = join(root, '.output-moved');
    const target = new FolderTarget(output);
    const at = (iso: string, m: Manifest) =>
      buildBundle({ manifest: m, root, process: processImage, now: () => new Date(iso) });
    const read = async () =>
      ContentBundle.parse(JSON.parse(await readFile(join(output, 'content.json'), 'utf8'))).notes;
    const first = await at('2026-11-01T10:00:00Z', manifest);
    await target.save(first.bundle, first.media);
    const [before] = await read();

    const moved: Manifest = structuredClone(manifest);
    moved.catalog.assessments.push({
      id: 'biologia-celular/certamen-3',
      courseId: 'biologia-celular',
      name: 'Certamen 3',
      position: 3,
    });
    const [entry] = moved.notes[0]!.notes.splice(0, 1);
    moved.notes.push({
      assessmentId: 'biologia-celular/certamen-3',
      notes: [{ ...entry!, position: 1, group: 'Semana 9' }],
    });
    const second = await at('2026-11-02T10:00:00Z', moved);
    expect((await target.save(second.bundle, second.media)).changedNotes).toEqual(['AP-BC-C2-11']);
    const after = (await read()).find((n) => n.id === 'AP-BC-C2-11')!;
    expect(after).toMatchObject({
      slug: before!.slug,
      code: before!.code,
      version: 1,
      publishedAt: before!.publishedAt,
      versionAt: before!.versionAt,
      assessmentId: 'biologia-celular/certamen-3',
      group: 'Semana 9',
    });
    expect(after.versionHash).toBe(before!.versionHash);
  });

  it('a note published before the articles (no version) is version 1 on its first save as one', async () => {
    const output = join(root, '.output-upgrade');
    const old = await build();
    // The PDF note: another text, so another hash, and no code.
    const pdf = old.bundle.notes.map(({ code: _c, versionHash: _v, ...n }) => ({
      ...n,
      hash: 'pdf',
    }));
    await new FolderTarget(output).save({ ...old.bundle, notes: pdf }, old.media);
    const now = await buildBundle({
      manifest,
      root,
      process: processImage,
      now: () => new Date('2026-11-05T00:00:00Z'),
    });
    await new FolderTarget(output).save(now.bundle, now.media);
    const [a] = ContentBundle.parse(
      JSON.parse(await readFile(join(output, 'content.json'), 'utf8')),
    ).notes;
    expect(a).toMatchObject({ version: 1, publishedAt: '2026-11-05T00:00:00.000Z' });
  });

  it('with --only keeps the others; without --only, a note that left the manifest leaves', async () => {
    const output = join(root, '.output-only');
    const all = await build();
    await new FolderTarget(output).save(all.bundle, all.media);
    const read = async () =>
      ContentBundle.parse(JSON.parse(await readFile(join(output, 'content.json'), 'utf8')))
        .notes.map((n) => n.id)
        .sort();

    const only = await buildBundle({
      manifest,
      root,
      process: processImage,
      only: ['AP-BC-C2-12'],
    });
    await new FolderTarget(output, true).save(only.bundle, only.media);
    expect(await read()).toEqual(['AP-BC-C2-11', 'AP-BC-C2-12']);

    // The manifest no longer has note 11.
    await new FolderTarget(output).save(only.bundle, only.media);
    expect(await read()).toEqual(['AP-BC-C2-12']);
  });
});

describe('validateReferences', () => {
  it('checks the web codes and the test of «Ponte a prueba»', () => {
    const bad: Manifest = structuredClone(manifest);
    bad.notes[0]!.notes[1]!.code = 'QV-BC-C2-11';
    bad.notes[0]!.notes[0]!.practice = { quizId: 'no-existe', groups: ['01'] };
    bad.notes[0]!.notes[1]!.practice = { groups: ['01'] };
    expect(() => validateReferences(bad)).toThrow(
      /test no-existe[\s\S]*QV-BC-C2-11 está repetido[\s\S]*sin decir qué test/,
    );
  });

  it('step 1.8: the notes of a group go one after the other by position', () => {
    const ok: Manifest = structuredClone(manifest);
    ok.notes[0]!.notes[0]!.group = 'S5 - SMAS y cavidad nasal';
    expect(() => validateReferences(ok)).not.toThrow();
    const split: Manifest = structuredClone(manifest);
    split.notes[0]!.notes.push({
      id: 'AP-BC-C2-13',
      slug: '13-via-exocitica',
      kind: 'lecture',
      position: 3,
      title: 'Vía exocítica',
      sources: [],
      sourceFile: 'otra/apunte.md',
      group: 'Semana 1',
    });
    split.notes[0]!.notes[0]!.group = 'Semana 1';
    split.notes[0]!.notes[1]!.group = 'Semana 2';
    expect(() => validateReferences(split)).toThrow(/grupo «Semana 1» queda partido/);
  });

  it('detects broken references and repeats', () => {
    const bad: Manifest = structuredClone(manifest);
    bad.catalog.courses.push({ id: 'x', semester: 9, name: 'X', emoji: '❓', position: 0 });
    bad.notes[0]!.notes[1]!.id = 'AP-BC-C2-11';
    bad.notes.push({ assessmentId: 'no/existe', notes: [] });
    expect(() => validateReferences(bad)).toThrow(
      /semestre 9[\s\S]*AP-BC-C2-11 está repetido[\s\S]*no\/existe/,
    );
  });
});

describe('decks', () => {
  const withDecks: Manifest = {
    ...structuredClone(manifest),
    decks: [
      {
        assessmentId: 'anatomia-1/certamen-1',
        decks: [{ apkg: 'mazos/Mazo de prueba.apkg' }],
      },
    ],
  };
  const buildDecksOnly = (now = '2026-10-31T12:00:00Z') =>
    buildBundle({
      manifest: withDecks,
      root,
      process: processImage,
      processCardImage,
      onlyDecks: true,
      now: () => new Date(now),
    });

  it('imports decks, presets, note types, notes and every card', async () => {
    const { bundle, warnings } = await buildDecksOnly();
    expect(() => ContentBundle.parse(bundle)).not.toThrow();
    expect(warnings).toEqual([]);
    expect(bundle.notes).toEqual([]);
    const week = '() Medicina UCH::1° Semestre::🦴 Anatomía I::Certamen 1::S1 - Semana de prueba';
    // The package brings the deck and its Extras (they keep their Anki ids); the importer adds the parents.
    expect(
      bundle.ankiDecks.map((d) => [d.name, d.preset, d.semester, d.courseId, d.assessmentId]),
    ).toEqual([
      ['() Medicina UCH', 'Default', null, null, null],
      ['() Medicina UCH::1° Semestre', 'Default', 1, null, null],
      ['() Medicina UCH::1° Semestre::🦴 Anatomía I', 'Default', 1, 'anatomia-1', null],
      [
        '() Medicina UCH::1° Semestre::🦴 Anatomía I::Certamen 1',
        'Default',
        1,
        'anatomia-1',
        'anatomia-1/certamen-1',
      ],
      [week, 'Default', 1, 'anatomia-1', 'anatomia-1/certamen-1'],
      [`${week}::Mazo de prueba`, 'Default', 1, 'anatomia-1', 'anatomia-1/certamen-1'],
      [`${week}::Mazo de prueba::Extras`, 'Extras', 1, 'anatomia-1', 'anatomia-1/certamen-1'],
    ]);
    const byName = new Map(bundle.ankiDecks.map((d) => [d.name, d]));
    expect(byName.get(`${week}::Mazo de prueba`)!.id).toBe('2059400110');
    expect(byName.get(`${week}::Mazo de prueba::Extras`)).toMatchObject({
      id: '2059400111',
      parentId: '2059400110',
    });
    expect(byName.get(`${week}::Mazo de prueba`)!.parentId).toBe(byName.get(week)!.id);
    expect(byName.get('() Medicina UCH')!.parentId).toBeNull();
    // A parent's id comes from its full name: the same in every import, 19 digits.
    expect(byName.get(week)!.id).toBe(containerDeckId(week));
    expect(containerDeckId(week)).toMatch(/^[1-9]\d{18}$/);
    expect(containerDeckId(week)).not.toBe(containerDeckId(`${week} `));
    expect(
      bundle.ankiPresets.map((p) => [p.name, (p.config['new'] as { perDay: number }).perDay]),
    ).toEqual([
      ['Default', 20],
      ['Extras', 0],
    ]);
    expect(bundle.ankiNoteTypes.map((t) => [t.name, t.kind, t.occlusion]).sort()).toEqual([
      ['Prueba · Básica', 'normal', false],
      ['Prueba · Cloze', 'cloze', false],
      ['Prueba · Oclusión', 'cloze', true],
    ]);
    expect(bundle.ankiNotes).toHaveLength(7);
    expect(bundle.ankiNotes.reduce((t, n) => t + n.cards.length, 0)).toBe(16);
    const first = bundle.ankiNotes.find((n) => n.guid === 'Or&8~[!Z2<')!;
    expect(first).toMatchObject({ code: 'T-PR-01-001', version: 2 });
    expect(first.createdAt).toMatch(/^20\d\d-\d\d-\d\dT/);
    expect(first.cards[0]!.sortField).toBe('¿Cuántas vértebras cervicales hay?');
  });

  it('sanitizes the cards: no scripts nor handlers, but the occlusion data and the CSS hooks stay', async () => {
    const { bundle } = await buildDecksOnly();
    const io = bundle.ankiNotes.find((n) => n.guid === 'oclusion-1')!;
    const back = io.cards[0]!.backHtml;
    expect(back).not.toMatch(/<script|anki\.imageOcclusion/);
    expect(back).toContain('<div class="cloze-highlight" data-ordinal="1" data-shape="rect"');
    expect(back).toContain('data-occludeinactive="1"');
    expect(back).toContain('<canvas id="image-occlusion-canvas"></canvas>');
    expect(back).toContain('<button id="toggle">');
    expect(back).toContain('style="display:none"');
    expect(io.cards[0]!.sortField).toBe('Vértebra de prueba');
    const hint = bundle.ankiNotes.find((n) => n.guid === 'Or&8~[!Z2<')!.cards[0]!.frontHtml;
    expect(hint).toContain('<a class="hint" href="#"');
    expect(hint).not.toContain('onclick');
    expect(hint).toContain('class="pie"');
  });

  it('only the importer puts data-media: one that comes in a field is dropped', async () => {
    const key = 'cards/0123456789abcdef0123456789abcdef.webp';
    const image = async (name: string) =>
      name === 'a.png'
        ? {
            key,
            width: 1,
            height: 1,
            contentType: 'image/webp' as const,
            read: async () => Buffer.alloc(0),
          }
        : null;
    const { html, media, missing } = await sanitizeCard(
      '<img src="a.png" data-media="notes/x.webp"><img src="b.png" data-media="notes/y.webp">' +
        '<span data-media="notes/z.webp" data-ordinal="1">t</span>',
      image,
    );
    expect(html).toBe(
      `<img data-media="${key}" /><img alt="[imagen no encontrada: b.png]" />` +
        '<span data-ordinal="1">t</span>',
    );
    expect(media).toEqual([key]);
    expect(missing).toEqual(['b.png']);
  });

  it('the images go as WebP under cards/ with data-media', async () => {
    const { bundle, media } = await buildDecksOnly();
    const keys = [...media.keys()];
    expect(keys).toHaveLength(2);
    for (const k of keys) expect(k).toMatch(/^cards\/[0-9a-f]{32}\.webp$/);
    const io = bundle.ankiNotes.find((n) => n.guid === 'oclusion-1')!;
    expect(io.cards[0]!.frontHtml).toMatch(/<img data-media="cards\/[0-9a-f]{32}\.webp" \/>/);
    expect(io.cards[0]!.frontHtml).not.toContain('src=');
    expect(io.media).toHaveLength(1);
  });

  it('--only does not touch the decks; the hash does not depend on the time', async () => {
    const { bundle } = await buildBundle({
      manifest: withDecks,
      root,
      process: processImage,
      only: ['AP-BC-C2-12'],
    });
    expect(bundle.ankiNotes).toEqual([]);
    const a = await buildDecksOnly('2026-10-31T12:00:00Z');
    const b = await buildDecksOnly('2026-11-02T12:00:00Z');
    expect(a.bundle.ankiNotes.map((n) => n.hash)).toEqual(b.bundle.ankiNotes.map((n) => n.hash));
  });

  it('FolderTarget keeps the notes with --only-decks and the decks with --only', async () => {
    const output = join(root, '.output-decks');
    const target = new FolderTarget(output);
    const all = await build();
    await target.save(all.bundle, all.media);
    const decks = await buildDecksOnly();
    const r1 = await target.save(decks.bundle, decks.media, { notes: false, decks: true });
    expect(r1.changedCards).toHaveLength(7);
    const read = async () =>
      ContentBundle.parse(JSON.parse(await readFile(join(output, 'content.json'), 'utf8')));
    let saved = await read();
    expect(saved.notes.map((n) => n.id)).toEqual(['AP-BC-C2-11', 'AP-BC-C2-12']);
    expect(saved.ankiNotes).toHaveLength(7);
    const key = saved.ankiNotes.find((n) => n.guid === 'oclusion-1')!.media[0]!;
    expect((await readFile(join(output, 'media', key))).length).toBeGreaterThan(0);

    // Again, later: nothing changed, the date is kept.
    const again = await buildDecksOnly('2026-11-05T00:00:00Z');
    const r2 = await target.save(again.bundle, again.media, { notes: false, decks: true });
    expect(r2).toMatchObject({ changedCards: [], removedCards: 0, movedCards: 0, retiredCards: 0 });

    saved = await read();
    expect(saved.ankiNotes[0]!.updatedAt).toBe('2026-10-31T12:00:00.000Z');

    // A notes-only import keeps the decks.
    const only = await buildBundle({
      manifest: withDecks,
      root,
      process: processImage,
      only: ['AP-BC-C2-12'],
    });
    await new FolderTarget(output, true).save(only.bundle, only.media, {
      notes: true,
      decks: false,
    });
    saved = await read();
    expect(saved.ankiNotes).toHaveLength(7);
    expect(saved.ankiDecks).toHaveLength(7);
  });

  it('FolderTarget says which cards went to another deck and which were taken out', async () => {
    const target = new FolderTarget(join(root, '.output-moves'));
    const first = await buildDecksOnly();
    await target.save(first.bundle, first.media, { notes: false, decks: true });
    const moved = structuredClone(first.bundle);
    const [a, b] = moved.ankiNotes;
    const other = moved.ankiDecks.find((d) => d.id !== a!.cards[0]!.deckId)!.id;
    a!.cards[0]!.deckId = other;
    a!.hash = 'cambiada';
    moved.ankiNotes = moved.ankiNotes.filter((n) => n !== b);
    const r = await target.save(moved, first.media, { notes: false, decks: true });
    expect(r).toMatchObject({ removedCards: 1, movedCards: 1, retiredCards: b!.cards.length });
  });

  it('warns when two packages bring the same note type with another CSS (the last one stays)', async () => {
    // A second package: the same note types, other decks and notes, and a changed CSS in one type.
    const read = async (path: string) => {
      const pkg = await readApkgFile(join(root, 'mazos/Mazo de prueba.apkg'));
      if (!path.endsWith('Otro.apkg')) return pkg;
      const c = pkg.collection;
      const id = (x: string) => `9${x.slice(1)}`;
      return {
        ...pkg,
        collection: {
          ...c,
          noteTypes: c.noteTypes.map((t, i) =>
            i === 0 ? { ...t, css: `${t.css}\n.nueva {}` } : t,
          ),
          decks: c.decks.map((d) => ({ ...d, id: id(d.id), name: d.name.replace('Mazo', 'Otro') })),
          notes: c.notes.map((n) => ({ ...n, guid: `otro-${n.guid}` })),
          cards: c.cards.map((k) => ({ ...k, deckId: id(k.deckId) })),
        },
      };
    };
    const two: Manifest = structuredClone(withDecks);
    two.decks[0]!.decks.push({ apkg: 'mazos/Otro.apkg' });
    const { bundle, warnings } = await buildBundle({
      manifest: two,
      root,
      process: processImage,
      processCardImage,
      onlyDecks: true,
      readApkg: read,
    });
    expect(warnings).toEqual([
      expect.stringMatching(/^Otro\.apkg: el tipo de nota «.+» trae otra plantilla o CSS/),
    ]);
    expect(bundle.ankiNoteTypes).toHaveLength(3);
    expect(bundle.ankiNoteTypes.some((t) => t.css.includes('.nueva {}'))).toBe(true);
    expect(bundle.ankiNotes).toHaveLength(14);
  });

  it("a deck name that does not say the catalog's semester, course or assessment is an error", async () => {
    const wrong = async (rename: (name: string) => string) => {
      const pkg = await readApkgFile(join(root, 'mazos/Mazo de prueba.apkg'));
      const c = pkg.collection;
      return {
        ...pkg,
        collection: { ...c, decks: c.decks.map((d) => ({ ...d, name: rename(d.name) })) },
      };
    };
    const run = (rename: (name: string) => string) =>
      buildBundle({
        manifest: withDecks,
        root,
        process: processImage,
        processCardImage,
        onlyDecks: true,
        readApkg: () => wrong(rename),
      });
    await expect(run((n) => n.replace('1° Semestre', '2° Semestre'))).rejects.toThrow(
      /tiene «2° Semestre» donde va el semestre \(«1° Semestre»/,
    );
    await expect(run((n) => n.replace('🦴 Anatomía I', 'Anatomía I'))).rejects.toThrow(
      /donde va el ramo \(«🦴 Anatomía I»/,
    );
    await expect(run((n) => n.replace('Certamen 1', 'Certamen 2'))).rejects.toThrow(
      /donde va el certamen \(«Certamen 1»/,
    );
    await expect(run((n) => n.replace('() Medicina UCH', '() Otra'))).rejects.toThrow(
      /donde va la raíz/,
    );
    await expect(
      run((n) => n.replace('Certamen 1::S1 - Semana de prueba::', '').replace('::Anatomía I', '')),
    ).rejects.toThrow();
    await expect(
      run((n) => n.replace('::Certamen 1::S1 - Semana de prueba::Mazo de prueba', '')),
    ).rejects.toThrow(/no está dentro de un certamen/);
  });

  it('a course called otherwise in Anki: «ankiName» in the catalog, and the site keeps its own name', async () => {
    const renamed = structuredClone(withDecks);
    const course = renamed.catalog.courses.find((c) => c.id === 'anatomia-1')!;
    course.name = 'Anatomía humana I';
    // Without «ankiName», the deck («🦴 Anatomía I») does not say the site's name.
    const run = () =>
      buildBundle({
        manifest: renamed,
        root,
        process: processImage,
        processCardImage,
        onlyDecks: true,
      });
    await expect(run()).rejects.toThrow(/«ankiName» en el catálogo/);
    course.ankiName = 'Anatomía I';
    const { bundle } = await run();
    expect(bundle.ankiDecks.some((d) => d.name.endsWith('::Mazo de prueba'))).toBe(true);
    const published = bundle.courses.find((c) => c.id === 'anatomia-1')!;
    expect(published.name).toBe('Anatomía humana I');
    expect(published).not.toHaveProperty('ankiName');
  });

  it("a package without «Default» gets Anki's for the parents it creates", async () => {
    const { bundle } = await buildBundle({
      manifest: withDecks,
      root,
      process: processImage,
      processCardImage,
      onlyDecks: true,
      readApkg: async (path) => {
        const pkg = await readApkgFile(path);
        const c = pkg.collection;
        return {
          ...pkg,
          collection: {
            ...c,
            presets: c.presets.map((p) => (p.name === 'Default' ? { ...p, name: 'Propio' } : p)),
          },
        };
      },
    });
    expect(bundle.ankiPresets.map((p) => p.name).sort()).toEqual(['Default', 'Extras', 'Propio']);
    expect(bundle.ankiPresets.find((p) => p.name === 'Default')!.config).toEqual({});
  });

  it('validateReferences checks the decks manifest', () => {
    const bad: Manifest = structuredClone(withDecks);
    bad.decks.push({ assessmentId: 'no/existe', decks: [{ apkg: 'mazos/Mazo de prueba.apkg' }] });
    expect(() => validateReferences(bad)).toThrow(/no\/existe[\s\S]*está repetido/);
  });

  describe('IMAIOS never goes up', () => {
    /** The sample package, with IMAIOS in the occlusion's tags and in another note's source. */
    const withImaios = async (renameDeck = false) => {
      const pkg = await readApkgFile(join(root, 'mazos/Mazo de prueba.apkg'));
      const c = pkg.collection;
      const other = c.notes.find((n) => n.guid === 'Or&8~[!Z2<')!;
      return {
        ...pkg,
        collection: {
          ...c,
          decks: renameDeck
            ? c.decks.map((d) => ({
                ...d,
                name: d.name.replace('Mazo de prueba', 'Mazo (IMAIOS)'),
              }))
            : c.decks,
          notes: c.notes.map((n) =>
            n.guid === 'oclusion-1'
              ? { ...n, tags: [...n.tags, 'imaios'] }
              : n === other
                ? {
                    ...n,
                    fields: n.fields.map((f, i) => (i === 1 ? `${f} (IMAIOS e-Anatomy)` : f)),
                  }
                : n,
          ),
        },
      };
    };
    const decksWith = (excludeImaios?: boolean, renameDeck = false) => {
      const m: Manifest = structuredClone(withDecks);
      if (excludeImaios !== undefined) m.decks[0]!.decks[0]!.excludeImaios = excludeImaios;
      return buildBundle({
        manifest: m,
        root,
        process: processImage,
        processCardImage,
        onlyDecks: true,
        readApkg: () => withImaios(renameDeck),
      });
    };

    it('a package with notes that name IMAIOS stops the import', async () => {
      await expect(decksWith()).rejects.toThrow(
        /2 nota\(s\) nombran IMAIOS.*"excludeImaios": true/,
      );
      await expect(decksWith(false)).rejects.toThrow(/nombran IMAIOS/);
    });

    it('with «excludeImaios» those notes are left out, and none of their images is processed', async () => {
      const all = await buildDecksOnly();
      const occlusionMedia = all.bundle.ankiNotes.find((n) => n.guid === 'oclusion-1')!.media;
      expect(occlusionMedia.length).toBeGreaterThan(0);
      const { bundle, media } = await decksWith(true);
      expect(bundle.ankiNotes.map((n) => n.guid)).not.toContain('oclusion-1');
      expect(bundle.ankiNotes.map((n) => n.guid)).not.toContain('Or&8~[!Z2<');
      expect(bundle.ankiNotes).toHaveLength(5);
      for (const key of occlusionMedia) {
        if (bundle.ankiNotes.some((n) => n.media.includes(key))) continue;
        expect(media.has(key)).toBe(false);
      }
      expect(JSON.stringify(bundle)).not.toMatch(/imaios/i);
    });

    it('a deck of IMAIOS is an error, even with «excludeImaios»', async () => {
      await expect(decksWith(true, true)).rejects.toThrow(/es un mazo de IMAIOS/);
    });

    it('an article that names IMAIOS stops the import', async () => {
      await writeFile(join(root, 'mala/imaios.md'), '# Corte\n\nCaptura de IMAIOS e-Anatomy.\n');
      const m: Manifest = structuredClone(manifest);
      m.notes[0]!.notes = [{ ...m.notes[0]!.notes[1]!, sourceFile: 'mala/imaios.md' }];
      await expect(buildBundle({ manifest: m, root, process: processImage })).rejects.toThrow(
        /AP-BC-C2-12 \(mala\/imaios\.md\): nombra IMAIOS/,
      );
    });
  });
});

describe('step 1.4: the image cache, --assessment and the batches', () => {
  it('converts an image once: the second time (also after reopening) it comes from the cache, the same', async () => {
    const folder = join(root, '.cache-images');
    const png = await readFile(join(root, 'clase/imagenes/ribosoma.png'));
    const cache = await ImageCache.open(folder);
    const a = await cache.file(join(root, 'clase/imagenes/ribosoma.png'));
    const b = await cache.card(png);
    expect([cache.misses, cache.hits]).toEqual([2, 0]);
    expect(a.key).toMatch(/^notes\//);
    expect(b.key).toMatch(/^cards\//);
    // The same key as without the cache, and the same bytes.
    const plain = await processImage(join(root, 'clase/imagenes/ribosoma.png'));
    expect(a.key).toBe(plain.key);
    expect(await a.read()).toEqual(await plain.read());

    const again = await ImageCache.open(folder);
    const c = await again.file(join(root, 'otra/img/misma.png')); // same bytes, other name
    expect([again.misses, again.hits]).toEqual([0, 1]);
    expect(c).toMatchObject({ key: a.key, width: a.width, height: a.height });
    expect(await c.read()).toEqual(await plain.read());

    // A WebP that went missing from the cache is made again.
    await rm(join(folder, a.key));
    const d = await again.file(join(root, 'clase/imagenes/ribosoma.png'));
    expect(again.misses).toBe(1);
    expect(await d.read()).toEqual(await plain.read());

    // One that no longer matches its key (cut, changed by hand) is never read under that key: it is removed,
    // and the next import converts it again.
    await writeFile(join(folder, a.key), Buffer.from('not the webp'));
    const damaged = await (
      await ImageCache.open(folder)
    ).file(join(root, 'clase/imagenes/ribosoma.png'));
    await expect(damaged.read()).rejects.toThrow(/dañada/);
    const fresh = await ImageCache.open(folder);
    const e = await fresh.file(join(root, 'clase/imagenes/ribosoma.png'));
    expect([fresh.misses, fresh.hits]).toEqual([1, 0]);
    expect(await e.read()).toEqual(await plain.read());
  });

  const twoAssessments: Manifest = {
    ...structuredClone(manifest),
    notes: [
      structuredClone(manifest.notes[0]!),
      {
        assessmentId: 'anatomia-1/certamen-1',
        notes: [
          {
            id: 'AP-A1-S3-01',
            slug: '01-columna',
            kind: 'lecture',
            position: 1,
            title: 'Columna',
            sources: [],
            sourceFile: 'otra/apunte.md',
          },
        ],
      },
    ],
    decks: [
      { assessmentId: 'anatomia-1/certamen-1', decks: [{ apkg: 'mazos/Mazo de prueba.apkg' }] },
    ],
  };

  it('--assessment builds only that assessment; an id that is not in the catalog is an error', async () => {
    const bc = await buildBundle({
      manifest: twoAssessments,
      root,
      process: processImage,
      assessments: ['biologia-celular/certamen-2'],
    });
    expect(bc.bundle.notes.map((n) => n.id)).toEqual(['AP-BC-C2-11', 'AP-BC-C2-12']);
    expect(bc.bundle.ankiNotes).toEqual([]);
    expect(bc.bundle.assessments).toHaveLength(2); // the catalog is always whole
    const an = await buildBundle({
      manifest: twoAssessments,
      root,
      process: processImage,
      assessments: ['anatomia-1/certamen-1'],
    });
    expect(an.bundle.notes.map((n) => n.id)).toEqual(['AP-A1-S3-01']);
    expect(an.bundle.ankiNotes).toHaveLength(7);
    await expect(
      buildBundle({ manifest: twoAssessments, root, process: processImage, assessments: ['x/y'] }),
    ).rejects.toThrow(/No existe la evaluación x\/y/);
  });

  it('FolderTarget with --assessment keeps the other assessment as it was, and removes only inside it', async () => {
    const output = join(root, '.output-assessment');
    const target = new FolderTarget(output);
    const all = await buildBundle({ manifest: twoAssessments, root, process: processImage });
    await target.save(all.bundle, all.media);
    const read = async () =>
      ContentBundle.parse(JSON.parse(await readFile(join(output, 'content.json'), 'utf8')));
    const before = await read();

    // Biología celular C2 without note 11, alone: Anatomía I stays whole.
    const m = structuredClone(twoAssessments);
    m.notes[0]!.notes = m.notes[0]!.notes.filter((n) => n.id !== 'AP-BC-C2-11');
    const bc = await buildBundle({
      manifest: m,
      root,
      process: processImage,
      assessments: ['biologia-celular/certamen-2'],
    });
    const r = await target.save(bc.bundle, bc.media, {
      notes: true,
      decks: true,
      tests: true,
      assessments: ['biologia-celular/certamen-2'],
    });
    expect(r).toMatchObject({ removedNotes: 1, removedCards: 0, changedCards: [] });
    const after = await read();
    expect(after.notes.map((n) => n.id).sort()).toEqual(['AP-A1-S3-01', 'AP-BC-C2-12']);
    expect(after.ankiNotes).toEqual(before.ankiNotes);
    expect(after.ankiDecks).toEqual(before.ankiDecks);
    expect(after.ankiNoteTypes).toEqual(before.ankiNoteTypes);
    expect(after.ankiPresets).toEqual(before.ankiPresets);
    expect(after.notes.find((n) => n.id === 'AP-A1-S3-01')).toEqual(
      before.notes.find((n) => n.id === 'AP-A1-S3-01'),
    );

    // Anatomía I C1 alone, without its decks: they go, with their notes; Biología celular stays.
    const n = structuredClone(twoAssessments);
    n.decks = [];
    const an = await buildBundle({
      manifest: n,
      root,
      process: processImage,
      assessments: ['anatomia-1/certamen-1'],
    });
    const r2 = await target.save(an.bundle, an.media, {
      notes: true,
      decks: true,
      tests: true,
      assessments: ['anatomia-1/certamen-1'],
    });
    expect(r2.removedCards).toBe(7);
    const last = await read();
    expect(last.ankiNotes).toEqual([]);
    expect(last.notes.map((n) => n.id).sort()).toEqual(['AP-A1-S3-01', 'AP-BC-C2-12']);
    // The decks above the assessment stay (another assessment of the course could use them).
    expect(last.ankiDecks.every((d) => d.assessmentId === null)).toBe(true);
    expect(last.ankiDecks.length).toBeGreaterThan(0);
  });

  it('FolderTarget without decks (--only, --only-tests) writes the new notes and catalog, and keeps the decks', async () => {
    const output = join(root, '.output-no-decks');
    const target = new FolderTarget(output, true);
    const all = await buildBundle({ manifest: twoAssessments, root, process: processImage });
    await target.save(all.bundle, all.media);
    const read = async () =>
      ContentBundle.parse(JSON.parse(await readFile(join(output, 'content.json'), 'utf8')));
    const before = await read();

    // One note changed and an assessment renamed in the catalog, imported without decks or tests.
    const next = structuredClone(all.bundle);
    const note = next.notes.find((n) => n.id === 'AP-BC-C2-12')!;
    note.title = 'Comunicación celular (corregida)';
    note.hash = 'cambiada';
    next.assessments[0]!.name = 'Certamen 1 (renombrado)';
    const r = await target.save({ ...next, notes: [note] }, all.media, {
      notes: true,
      decks: false,
      tests: false,
      partialNotes: true,
    });
    expect(r.changedNotes).toEqual(['AP-BC-C2-12']);
    const after = await read();
    expect(after.notes.find((n) => n.id === 'AP-BC-C2-12')!.title).toBe(
      'Comunicación celular (corregida)',
    );
    expect(after.notes.map((n) => n.id).sort()).toEqual(before.notes.map((n) => n.id).sort());
    expect(after.assessments[0]!.name).toBe('Certamen 1 (renombrado)');
    expect(after.ankiNotes).toEqual(before.ankiNotes);
    expect(after.ankiDecks).toEqual(before.ankiDecks);
  });

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

describe('sharedConflicts (--assessment and what the whole site shares)', () => {
  const type = {
    id: '1',
    name: 'Básica',
    kind: 'normal' as const,
    occlusion: false,
    fields: ['Frente'],
    templates: [{ name: 'Tarjeta 1', qfmt: '{{Frente}}', afmt: '{{Frente}}' }],
    css: '',
    sortField: 0,
  };
  const deck = (id: string, assessmentId: string | null, preset = 'Default') =>
    ({ id, assessmentId, preset }) as never;
  const note = (guid: string, deckId: string) =>
    ({ guid, noteTypeId: '1', cards: [{ deckId }] }) as never;
  const before = {
    ankiNoteTypes: [type],
    ankiPresets: [{ name: 'Default', config: { new: { perDay: 20 } } }],
    ankiDecks: [deck('9', null), deck('10', 'a/c1'), deck('20', 'b/c1')],
    ankiNotes: [note('x', '10'), note('y', '20')],
  };
  const scope = { notes: true, decks: true, tests: true, assessments: ['a/c1'] };

  it('what another assessment uses and would change, by name and by who uses it', () => {
    expect(
      sharedConflicts(
        before,
        {
          ankiNoteTypes: [{ ...type, css: 'p {}' }],
          ankiPresets: [{ name: 'Default', config: {} }],
        },
        scope,
      ),
    ).toEqual([
      { kind: 'noteType', id: '1', name: 'Básica', usedBy: ['b/c1'] },
      { kind: 'preset', id: 'Default', name: 'Default', usedBy: ['b/c1'] },
    ]);
  });

  it('nothing if it is the same (whatever the order of the keys), new, only theirs, or a whole import', () => {
    const same = {
      ankiNoteTypes: [{ ...type }],
      ankiPresets: [{ config: { new: { perDay: 20 } }, name: 'Default' }],
    };
    expect(sharedConflicts(before, same, scope)).toEqual([]);
    const changed = {
      ankiNoteTypes: [
        { ...type, id: '2' },
        { ...type, css: 'p {}' },
      ],
      ankiPresets: [{ name: 'Otro', config: {} }],
    };
    const onlyA = {
      ...before,
      ankiNotes: [note('x', '10')],
      ankiDecks: before.ankiDecks.slice(0, 2),
    };
    expect(sharedConflicts(onlyA, changed, scope)).toEqual([]);
    expect(sharedConflicts(before, changed, { ...scope, assessments: undefined })).toEqual([]);
    expect(sharedConflicts(before, changed, { ...scope, decks: false })).toEqual([]);
  });
});

describe('step 1.5: content/unpublished.json', () => {
  const off = (kind: 'note' | 'deck' | 'quiz' | 'image', id: string) => ({
    kind,
    id,
    reason: 'Error grave',
    date: '2026-11-08',
  });
  const DECK = '2059400110';
  const EXTRAS = '2059400111';
  const withList = (items: ReturnType<typeof off>[]): Manifest => ({
    ...structuredClone(manifest),
    decks: [
      { assessmentId: 'anatomia-1/certamen-1', decks: [{ apkg: 'mazos/Mazo de prueba.apkg' }] },
    ],
    unpublished: items,
  });
  const buildWith = (m: Manifest, extra: Partial<Parameters<typeof buildBundle>[0]> = {}) =>
    buildBundle({
      manifest: m,
      root,
      process: processImage,
      processCardImage,
      now: () => new Date('2026-11-08T12:00:00Z'),
      ...extra,
    });

  it('an article of the list is not read nor converted (a broken one does not stop the import), and the report says so', async () => {
    const m = withList([off('note', 'AP-BC-C2-12')]);
    m.notes[0]!.notes[1]!.sourceFile = 'no-existe/apunte.md';
    const r = await buildWith(m);
    expect(r.bundle.notes.map((n) => n.id)).toEqual(['AP-BC-C2-11']);
    expect(r.unpublished).toEqual([{ kind: 'note', id: 'AP-BC-C2-12', what: '«Comunicación»' }]);
    await expect(buildWith(m, { only: ['AP-BC-C2-12'] })).rejects.toThrow(
      /AP-BC-C2-12 está en content\/unpublished\.json/,
    );
  });

  it('a deck goes with every deck below it, its notes and the images only they used', async () => {
    const all = await buildWith(withList([]));
    const r = await buildWith(withList([off('deck', DECK)]));
    expect(r.bundle.ankiDecks.map((d) => d.id)).not.toContain(DECK);
    expect(r.bundle.ankiDecks.map((d) => d.id)).not.toContain(EXTRAS);
    expect(r.bundle.ankiDecks).toHaveLength(all.bundle.ankiDecks.length - 2);
    expect(r.bundle.ankiNotes).toEqual([]);
    const cardKeys = [...all.media.keys()].filter((k) => k.startsWith('cards/'));
    expect(cardKeys.length).toBeGreaterThan(0);
    expect([...r.media.keys()].filter((k) => k.startsWith('cards/'))).toEqual([]);
    expect(r.unpublished).toEqual([
      { kind: 'deck', id: DECK, what: '«Mazo de prueba» (2 mazos, 7 notas, 16 tarjetas)' },
    ]);
    expect(() => ContentBundle.parse(r.bundle)).not.toThrow();
  });

  it('only the subdeck: the notes with cards above stay with those, with another hash', async () => {
    const all = await buildWith(withList([]));
    const r = await buildWith(withList([off('deck', EXTRAS)]));
    const inExtras = all.bundle.ankiNotes.filter((n) => n.cards.some((c) => c.deckId === EXTRAS));
    expect(inExtras.length).toBeGreaterThan(0);
    for (const before of all.bundle.ankiNotes) {
      const after = r.bundle.ankiNotes.find((n) => n.guid === before.guid);
      const kept = before.cards.filter((c) => c.deckId !== EXTRAS);
      if (!kept.length) {
        expect(after).toBeUndefined();
        continue;
      }
      expect(after!.cards).toEqual(kept);
      if (kept.length === before.cards.length) expect(after!.hash).toBe(before.hash);
      else {
        const { hash: h, updatedAt: _u, ...rest } = after!;
        expect(h).not.toBe(before.hash);
        expect(h).toBe(hash(rest));
      }
    }
  });

  it('a test of the list is not converted', async () => {
    const m = withList([off('quiz', 'biologia-celular-certamen-2-practica')]);
    m.tests = [
      {
        assessmentId: 'biologia-celular/certamen-2',
        tests: [{ slug: 'practica', position: 1, folder: 'no-existe', title: 'Práctica' }],
      },
    ];
    const r = await buildWith(m);
    expect(r.bundle.quizzes).toEqual([]);
    expect(r.unpublished).toEqual([
      { kind: 'quiz', id: 'biologia-celular-certamen-2-practica', what: '«Práctica»' },
    ]);
  });

  it('an image of the list that a published piece uses stops the import, in the folder and in the cloud', async () => {
    const all = await buildWith(withList([]));
    const key = all.bundle.notes[0]!.media[0]!;
    await expect(buildWith(withList([off('image', key)]))).rejects.toThrow(
      new RegExp(
        `la imagen ${key.replace('.', '\\.')} está en content/unpublished\\.json y la usa apunte AP-BC-C2-11, apunte AP-BC-C2-12`,
      ),
    );
    // Off with the pieces that use it, nothing stops.
    const r = await buildWith(
      withList([off('image', key), off('note', 'AP-BC-C2-11'), off('note', 'AP-BC-C2-12')]),
    );
    expect(r.media.has(key)).toBe(false);
  });

  it('FolderTarget (dry run): what the list names leaves content.json and never comes back while it is there', async () => {
    const output = join(root, '.output-unpublished');
    const target = new FolderTarget(output);
    const all = await buildWith(withList([]));
    await target.save(all.bundle, all.media);
    const r = await buildWith(withList([off('note', 'AP-BC-C2-12'), off('deck', DECK)]));
    const report = await target.save(r.bundle, r.media);
    expect(report).toMatchObject({ removedNotes: 1, removedCards: 7 });
    const saved = ContentBundle.parse(
      JSON.parse(await readFile(join(output, 'content.json'), 'utf8')),
    );
    expect(saved.notes.map((n) => n.id)).toEqual(['AP-BC-C2-11']);
    expect(saved.ankiNotes).toEqual([]);
    expect(saved.ankiDecks.map((d) => d.id)).not.toContain(DECK);
  });

  it('readUnpublished: a missing file is nothing; a bad id, a missing reason or a repeat is an error', async () => {
    const file = join(root, 'unpublished.json');
    expect(await readUnpublished(join(root, 'no-existe.json'))).toEqual([]);
    const write = (items: unknown[]) => writeFile(file, JSON.stringify({ items }));
    await write([
      off('note', 'AP-BC-C2-11'),
      off('deck', DECK),
      off('quiz', 'practica-bc'),
      off('image', 'notes/0123456789abcdef.webp'),
    ]);
    expect(await readUnpublished(file)).toHaveLength(4);
    for (const bad of [
      off('note', 'QV-BC-C2-11'),
      off('deck', 'Mazo de prueba'),
      off('image', 'notes/../x.webp'),
      { ...off('note', 'AP-BC-C2-11'), reason: ' ' },
      { ...off('note', 'AP-BC-C2-11'), date: 'ayer' },
    ]) {
      await write([bad]);
      await expect(readUnpublished(file)).rejects.toThrow();
    }
    await write([off('note', 'AP-BC-C2-11'), off('note', 'AP-BC-C2-11')]);
    await expect(readUnpublished(file)).rejects.toThrow(/repetido/);
  });

  it('sameUnpublished: the same pieces in any order; an entry more or less, or another reason only, as it is', () => {
    const a = [off('note', 'AP-BC-C2-11'), off('deck', DECK)];
    expect(sameUnpublished(a, [...a].reverse())).toBe(true);
    expect(sameUnpublished(a, [{ ...a[0]!, reason: 'Otro motivo' }, a[1]!])).toBe(true);
    expect(sameUnpublished(a, [a[0]!])).toBe(false);
    expect(sameUnpublished([], [off('quiz', 'practica-bc')])).toBe(false);
    expect(sameUnpublished(a, [a[0]!, off('deck', EXTRAS)])).toBe(false);
  });

  it.skipIf(!PRIVATE.content)(
    privately(
      "step 1.8: the private repository's manifest is valid; the Seminario 8 is in the Certamen 3 with its identity",
    ),
    async () => {
      const m = await readManifest(PRIVATE.content!, { history: null });
      const ids = m.catalog.assessments.map((a) => a.id);
      for (const id of [
        'anatomia-1/certamen-1',
        'anatomia-1/certamen-3',
        'biologia-celular/certamen-2',
        'biologia-celular/certamen-3',
        'salud-publica/certamen',
        'bioestadistica/control-sumativo-6',
      ]) {
        expect(ids).toContain(id);
      }
      expect(new Set(ids).size).toBe(ids.length);
      // Revisión de cero (1.8): the 1st semester's assessments as the school's report of 2026 lists them (its annex 1:
      // Anatomía I and Matemáticas three certámenes, Química and MPyS two; IPM has three «Certamen Unidad …» of
      // rotating modules, not a «Certamen 1»: the owner (7-11-2026) said they have no order, it changes by student, so
      // they go by name). Bioestadística: only the summative controls (the formative ones are the same material); no
      // exams (they repeat the material); no suggested dates (they are of one semester, not valid for other years).
      const of = (course: string) =>
        m.catalog.assessments.filter((a) => a.courseId === course).map((a) => a.name);
      expect(of('anatomia-1')).toEqual(['Certamen 1', 'Certamen 2', 'Certamen 3']);
      expect(of('matematicas')).toEqual(['Certamen 1', 'Certamen 2', 'Certamen 3']);
      expect(of('quimica-general-y-organica')).toEqual(['Certamen 1', 'Certamen 2']);
      expect(of('medicina-persona-y-sociedad')).toEqual(['Certamen 1', 'Certamen 2']);
      expect(of('introduccion-a-la-profesion-medica')).toEqual([
        'Curso de vida y comunicación efectiva',
        'Primeros auxilios y signos vitales',
        'Ser médica/o en la Universidad de Chile',
      ]);
      expect(of('bioestadistica')).toEqual([1, 2, 3, 4, 5, 6].map((i) => `Control sumativo ${i}`));
      expect(m.catalog.assessments.filter((a) => /examen/i.test(a.name))).toEqual([]);
      expect(
        m.catalog.assessments.filter((a) => 'suggestedDate' in a && a.suggestedDate != null),
      ).toEqual([]);
      const where = m.notes.flatMap((g) =>
        g.notes.map((n) => ({ assessmentId: g.assessmentId, ...n })),
      );
      const seminar = where.find((n) => n.id === 'AP-BC-C2-SEM8')!;
      expect(seminar).toMatchObject({
        assessmentId: 'biologia-celular/certamen-3',
        code: 'QV-BC-C2-SEM8',
        slug: 'seminario-8-comunicacion-intercelular',
      });
      // Its «Ponte a prueba» was the Certamen 2's test, which an article of another assessment cannot name.
      expect(seminar.practice).toBeUndefined();
      expect(seminar.sourceFile).toContain('/Certamen 3/Seminario 8 - Comunicación intercelular/');
    },
  );

  it.skipIf(!PRIVATE.content)(
    privately('content/unpublished.json of the private repository is valid (and empty)'),
    async () => {
      const items = await readUnpublished(join(PRIVATE.content!, 'unpublished.json'));
      expect(items).toEqual([]);
    },
  );
});
