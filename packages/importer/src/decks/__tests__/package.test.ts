// Tests the decks of an import: each package's decks, notes and cards, the names they must have and what never goes up.
import { readApkgFile } from '@qv/anki-format';
import type { AnkiPackage } from '@qv/anki-format';
import { sanitizeCard } from '@qv/html/sanitize';
import { ContentBundle, ROOT_DECK_NAME } from '@qv/schema';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildBundle } from '../../bundle/build';
import { validateReferences } from '../../manifest/references';
import type { Manifest } from '../../manifest/schemas';
import { processCardImage, processImage } from '../../media/images';
import { packCardIndexes } from '../../targets/browseIndex';
import { FolderTarget } from '../../targets/FolderTarget';
import { createRoot, manifest } from '../../test/importerFixtures';
import { containerDeckId } from '../names';
import { processPackage } from '../package';
import type { DecksState } from '../types';

let root: string;

beforeAll(async () => {
  root = await createRoot();
});

afterAll(() => rm(root, { recursive: true, force: true }));

const build = () =>
  buildBundle({
    manifest,
    root,
    process: processImage,
    now: () => new Date('2026-10-31T12:00:00Z'),
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
    expect(byName.get(week)!.id).toBe(containerDeckId(week));
    expect(containerDeckId(week)).toMatch(/^[1-9]\d{18}$/);
    expect(containerDeckId(week)).not.toBe(containerDeckId(`${week} `));
    expect(
      bundle.ankiPresets.map((p) => [p.name, (p.config.new as { perDay: number }).perDay]),
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

    const again = await buildDecksOnly('2026-11-05T00:00:00Z');
    const r2 = await target.save(again.bundle, again.media, { notes: false, decks: true });
    expect(r2).toMatchObject({ changedCards: [], removedCards: 0, movedCards: 0, retiredCards: 0 });

    saved = await read();
    expect(saved.ankiNotes[0]!.updatedAt).toBe('2026-10-31T12:00:00.000Z');

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

    it('the browser index and its thumbnails leave those notes out too', async () => {
      const { bundle, media } = await decksWith(true);
      const [packed] = packCardIndexes(bundle);
      expect(packed!.index.notes.map((n) => n.guid)).not.toContain('oclusion-1');
      expect(packed!.index.notes.map((n) => n.guid)).not.toContain('Or&8~[!Z2<');
      expect(gunzipSync(packed!.body).toString()).not.toMatch(/imaios/i);
      const folder = await mkdtemp(join(tmpdir(), 'qv-index-imaios-'));
      try {
        const report = await new FolderTarget(folder).save(bundle, media, {
          notes: false,
          decks: true,
        });
        expect(report).toMatchObject({ thumbsUploaded: packed!.thumbs.size, indexesWritten: 1 });
        const all = await buildDecksOnly();
        const left = all.bundle.ankiNotes
          .filter((n) => n.guid === 'oclusion-1' || n.guid === 'Or&8~[!Z2<')
          .flatMap((n) => n.media)
          .filter((k) => !bundle.ankiNotes.some((n) => n.media.includes(k)));
        expect(left.length).toBeGreaterThan(0);
        for (const image of packed!.thumbs.values()) expect(left).not.toContain(image);
      } finally {
        await rm(folder, { recursive: true, force: true });
      }
    });

    it('«excludeCards» leaves those cards out, and a note left without cards too', async () => {
      const all = await buildDecksOnly();
      const two = all.bundle.ankiNotes.find((n) => n.cards.length > 1)!;
      const one = all.bundle.ankiNotes.find((n) => n.cards.length === 1)!;
      const folder = await mkdtemp(join(tmpdir(), 'qv-excluded-'));
      try {
        const list = join(folder, 'fuera.json');
        await writeFile(
          list,
          JSON.stringify({
            cards: [
              { guid: two.guid, ord: two.cards[0]!.ord },
              { guid: one.guid, ord: one.cards[0]!.ord },
              { guid: 'otra-nota', ord: 0 },
            ],
          }),
        );
        const m: Manifest = structuredClone(withDecks);
        m.decks[0]!.decks[0]!.excludeCards = list;
        const { bundle } = await buildBundle({
          manifest: m,
          root,
          process: processImage,
          processCardImage,
          onlyDecks: true,
        });
        const kept = bundle.ankiNotes.find((n) => n.guid === two.guid)!;
        expect(kept.cards.map((c) => c.ord)).toEqual(two.cards.slice(1).map((c) => c.ord));
        expect(bundle.ankiNotes.map((n) => n.guid)).not.toContain(one.guid);
        expect(bundle.ankiNotes).toHaveLength(all.bundle.ankiNotes.length - 1);
      } finally {
        await rm(folder, { recursive: true, force: true });
      }
    });

    it('«excludeCards» that is not a list of cards stops the import', async () => {
      const folder = await mkdtemp(join(tmpdir(), 'qv-excluded-'));
      try {
        const list = join(folder, 'fuera.json');
        await writeFile(list, JSON.stringify({ cards: [{ guid: 'x' }] }));
        const m: Manifest = structuredClone(withDecks);
        m.decks[0]!.decks[0]!.excludeCards = list;
        await expect(
          buildBundle({
            manifest: m,
            root,
            process: processImage,
            processCardImage,
            onlyDecks: true,
          }),
        ).rejects.toThrow(/no es una lista/);
      } finally {
        await rm(folder, { recursive: true, force: true });
      }
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

describe('decks: the packages that do not fit', () => {
  const SAMPLE_PATH = () => join(root, 'mazos/Mazo de prueba.apkg');
  const MAZO =
    '() Medicina UCH::1° Semestre::🦴 Anatomía I::Certamen 1::S1 - Semana de prueba::Mazo de prueba';
  const sample = () => readApkgFile(SAMPLE_PATH());

  const manifestOf = (...apkg: string[]): Manifest => ({
    ...structuredClone(manifest),
    decks: [
      {
        assessmentId: 'anatomia-1/certamen-1',
        decks: apkg.map((a) => ({ apkg: a })),
      },
    ],
  });

  /** Builds only the decks, giving each .apkg of the manifest the package `packages[name]` makes. */
  const run = async (
    packages: Record<string, () => Promise<AnkiPackage>>,
    options: { onProgress?: (m: string) => void; manifest?: Manifest } = {},
  ) =>
    buildBundle({
      manifest: options.manifest ?? manifestOf(...Object.keys(packages)),
      root,
      process: processImage,
      processCardImage,
      onlyDecks: true,
      ...(options.onProgress ? { onProgress: options.onProgress } : {}),
      readApkg: (path) => packages[path.split('/').at(-1)!]!(),
    });

  /** A copy of the sample under another name: its own decks, note ids and guids. */
  const renamed = async (tag: string, edit: (c: AnkiPackage['collection']) => void = () => {}) => {
    const pkg = await sample();
    const c = structuredClone(pkg.collection);
    for (const d of c.decks) {
      if (d.id === '1') continue;
      d.id = `${tag}${d.id}`;
      d.name = d.name.replace('Mazo de prueba', `Mazo ${tag}`);
    }
    for (const k of c.cards) if (k.deckId !== '1') k.deckId = `${tag}${k.deckId}`;
    for (const n of c.notes) n.guid = `${tag}-${n.guid}`;
    edit(c);
    return { ...pkg, collection: c };
  };

  it('a card that is not in a deck of the tree is not published, and its note with it', async () => {
    const pkg = await sample();
    const c = structuredClone(pkg.collection);
    c.cards.find((k) => k.id === '1793497867163')!.deckId = '999';
    const { bundle, warnings } = await run({ 'a.apkg': async () => ({ ...pkg, collection: c }) });
    expect(bundle.ankiNotes.map((n) => n.guid)).not.toContain('s@/AqX%n?#');
    expect(bundle.ankiNotes).toHaveLength(6);
    expect(warnings).toEqual([]);
  });

  it('a package without cards is a warning and adds nothing, not an error', async () => {
    const pkg = await sample();
    const { bundle, warnings } = await run({
      'a.apkg': async () => ({ ...pkg, collection: { ...pkg.collection, cards: [] } }),
    });
    expect(warnings).toEqual(['a.apkg: no tiene tarjetas.']);
    expect(bundle.ankiDecks).toEqual([]);
    expect(bundle.ankiNotes).toEqual([]);
  });

  it('a note whose note type is missing is skipped with a warning, and its guid is still taken', async () => {
    const pkg = await sample();
    const c = structuredClone(pkg.collection);
    c.noteTypes = c.noteTypes.filter((t) => t.name !== 'Prueba · Cloze');
    const { bundle, warnings } = await run({ 'a.apkg': async () => ({ ...pkg, collection: c }) });
    expect(warnings).toEqual([
      'a.apkg: la nota cloze-1 no tiene su tipo de nota.',
      'a.apkg: la nota cloze-anidado no tiene su tipo de nota.',
    ]);
    expect(bundle.ankiNotes.map((n) => n.guid)).not.toContain('cloze-1');
  });

  it('the same deck id with another name, or the same name with another id, in two packages stops the import', async () => {
    const sameId = await run({
      'a.apkg': () => renamed('A'),
      'b.apkg': () => renamed('A', (c) => c.decks.forEach((d) => (d.name = `${d.name}!`))),
    }).catch((e: unknown) => e as Error);
    expect((sameId as Error).message).toMatch(/b\.apkg: el mazo A2059400110 está repetido/);
    const sameName = await run({
      'a.apkg': () => renamed('A'),
      'b.apkg': () =>
        renamed('A', (c) => {
          for (const x of [...c.decks, ...c.cards]) {
            if ('deckId' in x) x.deckId = `${x.deckId}9`;
            else x.id = `${x.id}9`;
          }
        }),
    }).catch((e: unknown) => e as Error);
    expect((sameName as Error).message).toMatch(
      /b\.apkg: el mazo «.*Mazo A» viene en dos paquetes con ids distintos/,
    );
  });

  it('the same note in two packages stops the import, whatever the deck it is in', async () => {
    await expect(
      run({
        'a.apkg': () => renamed('A'),
        'b.apkg': async () => {
          const pkg = await renamed('B');
          for (const n of pkg.collection.notes) n.guid = n.guid.replace('B-', 'A-');
          return pkg;
        },
      }),
    ).rejects.toThrow(/b\.apkg: la nota A-Or&8~\[!Z2< está repetida/);
  });

  it('a preset that two packages configure differently warns and keeps the last; the same one does not warn', async () => {
    const extras = (perDay: number) => (c: AnkiPackage['collection']) => {
      const p = c.presets.find((x) => x.name === 'Extras')!;
      p.config = { ...p.config, new: { perDay } };
    };
    const same = await run({
      'a.apkg': () => renamed('A', extras(0)),
      'b.apkg': () => renamed('B', extras(0)),
    });
    expect(same.warnings).toEqual([]);
    const other = await run({
      'a.apkg': () => renamed('A', extras(0)),
      'b.apkg': () => renamed('B', extras(5)),
    });
    expect(other.warnings).toEqual([
      'b.apkg: el preset «Extras» trae otra configuración que en otro mazo; queda esta.',
    ]);
    expect(other.bundle.ankiPresets.find((p) => p.name === 'Extras')!.config).toMatchObject({
      new: { perDay: 5 },
    });
  });

  it('a deck without a preset stays without one', async () => {
    const pkg = await renamed('A', (c) => c.decks.forEach((d) => (d.presetId = null as never)));
    const { bundle } = await run({ 'a.apkg': async () => pkg });
    const deck = bundle.ankiDecks.find((d) => d.name.endsWith('Mazo A'))!;
    expect(deck.preset).toBeNull();
  });

  it('an image named with escapes is found by its decoded name; one that is not there is a warning, not an error', async () => {
    const pkg = await renamed('A', (c) => {
      const n = c.notes.find((x) => x.guid === 'A-Or&8~[!Z2<')!;
      n.fields[2] = '<img src="prueba%5Fvertebra.png"><img src="%E0%A4%A.png">';
    });
    const { bundle, warnings } = await run({
      'a.apkg': async () => ({
        ...pkg,
        readMedia: (name: string) => (name.includes('%') ? null : pkg.readMedia(name)),
      }),
    });
    expect(warnings).toEqual(
      expect.arrayContaining([expect.stringMatching(/falta la imagen %E0%A4%A\.png/)]),
    );
    expect(warnings.some((w) => w.includes('prueba%5Fvertebra'))).toBe(false);
    const note = bundle.ankiNotes.find((n) => n.guid === 'A-Or&8~[!Z2<')!;
    expect(note.media.length).toBeGreaterThan(0);
  });

  it('«excludeCards» that leaves nothing out is a warning; the progress counts what was left out', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'qv-excluded-'));
    try {
      const nothing = join(folder, 'nada.json');
      await writeFile(nothing, JSON.stringify({ cards: [{ guid: 'no-existe', ord: 0 }] }));
      const some = join(folder, 'algo.json');
      await writeFile(
        some,
        JSON.stringify({
          cards: [
            { guid: 'Or&8~[!Z2<', ord: 0 },
            { guid: 'cloze-1', ord: 1 },
          ],
        }),
      );
      const progress: string[] = [];
      const m = manifestOf('a.apkg');
      m.decks[0]!.decks[0]!.excludeCards = nothing;
      const none = await run(
        { 'a.apkg': sample },
        { manifest: m, onProgress: (x) => progress.push(x) },
      );
      expect(none.warnings).toEqual([
        'a.apkg: «excludeCards» no deja fuera ninguna tarjeta de este mazo.',
      ]);
      expect(progress.at(-1)).toBe('  2 mazos, 16 tarjetas · Mazo de prueba');
      m.decks[0]!.decks[0]!.excludeCards = some;
      progress.length = 0;
      await run({ 'a.apkg': sample }, { manifest: m, onProgress: (x) => progress.push(x) });
      expect(progress).toEqual([
        'mazo a.apkg',
        '  2 mazos, 14 tarjetas · Mazo de prueba · 2 tarjetas dejadas fuera',
      ]);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it('more than three IMAIOS notes are listed as three and «…»; with «excludeImaios» the progress counts them', async () => {
    const tagged = async () => {
      const pkg = await sample();
      const c = structuredClone(pkg.collection);
      for (const n of c.notes.slice(0, 4)) n.tags = [...n.tags, 'imaios'];
      return { ...pkg, collection: c };
    };
    await expect(run({ 'a.apkg': tagged })).rejects.toThrow(
      /4 nota\(s\) nombran IMAIOS \([^,]+, [^,]+, [^,)]+…\)/,
    );
    const m = manifestOf('a.apkg');
    m.decks[0]!.decks[0]!.excludeImaios = true;
    const progress: string[] = [];
    await run({ 'a.apkg': tagged }, { manifest: m, onProgress: (x) => progress.push(x) });
    expect(progress.at(-1)).toMatch(/ · 4 notas de IMAIOS fuera$/);
  });

  it('a package whose note types the caller does not list keeps its own versions', async () => {
    const state: DecksState = {
      noteTypes: new Map(),
      presets: new Map(),
      decks: new Map(),
      deckIds: new Set(),
      guids: new Set(),
      result: {
        noteTypes: [],
        presets: [],
        decks: [],
        notes: [],
        media: new Map(),
        gymkanas: [],
        warnings: [],
      },
    };
    await processPackage(
      {
        manifests: [],
        assessments: new Map(),
        courses: [],
        semesters: [],
        root,
        process: processCardImage,
        read: sample,
      },
      state,
      {
        semesterNumber: 1,
        courseId: 'anatomia-1',
        assessmentId: 'anatomia-1/certamen-1',
        expected: [ROOT_DECK_NAME, '1° Semestre', '🦴 Anatomía I', 'Certamen 1'],
      },
      { apkg: 'mazos/Mazo de prueba.apkg' },
      new Map(),
    );
    expect(state.noteTypes.size).toBe(3);
    expect(state.result.notes).toHaveLength(7);
    expect(state.decks.has(MAZO)).toBe(true);
  });
});
