// Tests the decks of an import: each package's decks, notes and cards, the names they must have and what never goes up.
import { readApkgFile } from '@qv/anki-format';
import { sanitizeCard } from '@qv/html/sanitize';
import { ContentBundle } from '@qv/schema';
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
import { FolderTarget } from '../../targets/folder';
import { createRoot, manifest } from '../../test/importerFixtures';
import { containerDeckId } from '../names';

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
