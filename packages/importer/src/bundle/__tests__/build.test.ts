// Tests building the bundle from the manifest: notes, images, hashes and the scope of the import.
import { readApkgFile } from '@qv/anki-format';
import { ContentBundle } from '@qv/schema';
import sharp from 'sharp';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Manifest } from '../../manifest/schemas';
import { MAX_WIDTH, processCardImage, processImage } from '../../media/images';
import { createRoot, manifest, twoAssessments } from '../../test/importerFixtures';
import { buildBundle } from '../build';
import { hash } from '../hash';

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
    expect(a!.version).toBeUndefined();
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
    expect(hash({ a: { b: 1, c: [{ d: 1, e: 2 }] } })).toBe(
      hash({ a: { c: [{ e: 2, d: 1 }], b: 1 } }),
    );
    expect(hash([1, 2])).not.toBe(hash([2, 1]));
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

describe('the image cache, --assessment and the batches', () => {
  it('--assessment builds only that assessment; an id that is not in the catalog is an error', async () => {
    const bc = await buildBundle({
      manifest: twoAssessments,
      root,
      process: processImage,
      assessments: ['biologia-celular/certamen-2'],
    });
    expect(bc.bundle.notes.map((n) => n.id)).toEqual(['AP-BC-C2-11', 'AP-BC-C2-12']);
    expect(bc.bundle.ankiNotes).toEqual([]);
    expect(bc.bundle.assessments).toHaveLength(2);
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
});

describe('the tests of the manifest', () => {
  const withTests = (folder: string, extra: object = {}): Manifest => ({
    ...structuredClone(manifest),
    tests: [
      {
        assessmentId: 'biologia-celular/certamen-2',
        tests: [{ slug: 'practica', position: 1, folder, ...extra }],
      },
    ],
  });

  async function quizFolder(name: string, question: string): Promise<string> {
    await mkdir(join(root, name, 'preguntas'), { recursive: true });
    await writeFile(join(root, name, 'test.json'), JSON.stringify({ titulo: 'Práctica' }));
    await writeFile(
      join(root, name, 'preguntas', '01.json'),
      JSON.stringify({ nombre: 'Uno', preguntas: [{ id: 'p1', q: question, r: 'La respuesta' }] }),
    );
    return name;
  }

  it('builds the test with the id of its slug, or with the one the manifest fixes, and reports progress', async () => {
    const folder = await quizFolder('Test - Normal', '¿Qué es un ribosoma?');
    const steps: string[] = [];
    const run = (m: Manifest) =>
      buildBundle({
        manifest: m,
        root,
        process: processImage,
        onProgress: (s) => steps.push(s),
        now: () => new Date('2026-10-31T12:00:00Z'),
      });
    const byDefault = await run(withTests(folder));
    expect(byDefault.bundle.quizzes.map((q) => q.id)).toEqual([
      'biologia-celular-certamen-2-practica',
    ]);
    expect(byDefault.bundle.quizzes[0]!.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(byDefault.bundle.quizzes[0]!.updatedAt).toBe('2026-10-31T12:00:00.000Z');
    const fixed = await run(withTests(folder, { id: 'id-fijo' }));
    expect(fixed.bundle.quizzes.map((q) => q.id)).toEqual(['id-fijo']);
    expect(steps).toContain('test practica');
  });

  it('a test that names IMAIOS is never published', async () => {
    const folder = await quizFolder('Test - Imaios', 'Corte de IMAIOS e-Anatomy');
    await expect(
      buildBundle({ manifest: withTests(folder), root, process: processImage }),
    ).rejects.toThrow(/test practica: nombra IMAIOS, que no se sube al sitio/);
  });

  it('--assessment leaves out the tests of the other assessments', async () => {
    const folder = await quizFolder('Test - Otro', '¿Qué es un ribosoma?');
    const m = withTests(folder);
    const r = await buildBundle({
      manifest: m,
      root,
      process: processImage,
      assessments: ['anatomia-1/certamen-1'],
    });
    expect(r.bundle.quizzes).toEqual([]);
    expect(r.testsIncluded).toBe(true);
  });
});

describe('the pieces the caller can replace', () => {
  it('reads the decks with the given reader and shrinks their images with the given processor', async () => {
    const read: string[] = [];
    const images: number[] = [];
    const steps: string[] = [];
    const r = await buildBundle({
      manifest: twoAssessments,
      root,
      process: processImage,
      assessments: ['anatomia-1/certamen-1'],
      readApkg: async (path) => {
        read.push(path.split('/').at(-1)!);
        return readApkgFile(path);
      },
      processCardImage: async (data) => {
        images.push(data.length);
        return processCardImage(data);
      },
      onProgress: (m) => steps.push(m),
    });
    expect(r.bundle.ankiNotes).toHaveLength(7);
    expect(new Set(read)).toEqual(new Set(['Mazo de prueba.apkg']));
    expect(images.length).toBeGreaterThan(0);
    expect(steps.length).toBeGreaterThan(0);
  });

  it('a test of the unpublished list is reported by its slug when it has no title, and its folder is not read', async () => {
    const m: Manifest = {
      ...structuredClone(manifest),
      tests: [
        {
          assessmentId: 'biologia-celular/certamen-2',
          tests: [{ slug: 'practica', position: 1, folder: 'no-existe' }],
        },
      ],
      unpublished: [
        {
          kind: 'quiz',
          id: 'biologia-celular-certamen-2-practica',
          reason: 'Error grave',
          date: '2026-11-08',
        },
      ],
    };
    const r = await buildBundle({ manifest: m, root, process: processImage });
    expect(r.unpublished).toEqual([
      { kind: 'quiz', id: 'biologia-celular-certamen-2-practica', what: '«practica»' },
    ]);
  });

  it('the images and warnings of a test join those of the notes, under the quiz processor', async () => {
    const dir = join(root, 'Test - Con figura');
    await mkdir(join(dir, 'preguntas'), { recursive: true });
    await mkdir(join(dir, 'figuras'), { recursive: true });
    await writeFile(
      join(dir, 'figuras', 'f.png'),
      await sharp({ create: { width: 30, height: 20, channels: 3, background: '#a33' } })
        .png()
        .toBuffer(),
    );
    await writeFile(join(dir, 'test.json'), JSON.stringify({ titulo: 'Con figura' }));
    await writeFile(
      join(dir, 'preguntas', '01.json'),
      JSON.stringify({
        nombre: 'Uno',
        preguntas: [
          {
            id: 'p1',
            q: '¿Qué se ve?',
            r: 'Una foto',
            fig: [{ tipo: 'imagen', src: 'figuras/f.png', alt: 'Foto' }],
          },
        ],
      }),
    );
    const m: Manifest = {
      ...structuredClone(manifest),
      tests: [
        {
          assessmentId: 'biologia-celular/certamen-2',
          tests: [{ slug: 'figura', position: 1, folder: 'Test - Con figura' }],
        },
      ],
    };
    const seen: string[] = [];
    const r = await buildBundle({
      manifest: m,
      root,
      process: processImage,
      processQuizImage: async (data) => {
        seen.push('quiz');
        const img = await processCardImage(data);
        return { ...img, key: img.key.replace('cards/', 'tests/') };
      },
    });
    const [quiz] = r.bundle.quizzes;
    expect(seen).toEqual(['quiz']);
    expect(quiz!.media).toHaveLength(1);
    expect(r.media.has(quiz!.media[0]!)).toBe(true);
    expect(quiz!.media[0]).toMatch(/^tests\//);
  });
});
