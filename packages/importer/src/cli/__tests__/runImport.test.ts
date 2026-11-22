// Tests `npm run import` end to end in this process: its folder and draft targets, its warnings and its guards.
import { writeFileSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportError } from '../../ImportError';
import type * as Cloud from '../../targets/cloud';
import { createRoot, manifest } from '../../test/importerFixtures';
import * as taxonomyFixtures from '../../test/taxonomyFixtures';
import { HELP } from '../importArgs';

const drafts = vi.hoisted(() => ({
  saves: [] as { bundle: unknown; scope: unknown }[],
  rpcs: [] as { fn: string; args: unknown }[],
  rpcError: null as string | null,
}));

vi.mock('../../targets/cloud', async (importOriginal) => {
  const real = await importOriginal<typeof Cloud>();
  return {
    ...real,
    CloudTarget: {
      fromConfig: (_config: unknown, schema: string) => ({
        save: async (bundle: unknown, _media: unknown, scope: unknown) => {
          drafts.saves.push({ bundle: { schema, ...(bundle as object) }, scope });
          const { emptyReport } = await import('../../sync/report');
          return emptyReport();
        },
      }),
    },
  };
});

vi.mock('../../targets/contentDatabase', () => ({
  contentDatabase: () => ({
    rpc: async (fn: string, args: unknown) => {
      drafts.rpcs.push({ fn, args });
      return { data: null, error: drafts.rpcError ? { message: drafts.rpcError } : null };
    },
  }),
}));

const { pathsOf, runImport } = await import('../runImport');

let root: string;
let content: string;

const CLOUD_ENV = {
  CONTENT_SUPABASE_URL: 'https://content.example.test',
  CONTENT_SERVICE_ROLE_KEY: 'service',
  R2_ACCOUNT_ID: 'cuenta',
  R2_ACCESS_KEY_ID: 'id',
  R2_SECRET_ACCESS_KEY: 'secreto',
  R2_BUCKET: 'balde',
};

beforeAll(async () => {
  root = await createRoot();
  content = join(root, 'content');
  await mkdir(join(content, 'notes'), { recursive: true });
  await mkdir(join(content, 'decks'), { recursive: true });
  await writeFile(join(content, 'catalog.json'), JSON.stringify(manifest.catalog));
  await writeFile(join(content, 'notes/bc.json'), JSON.stringify(manifest.notes[0]));
  await writeFile(
    join(content, 'decks/a1.json'),
    JSON.stringify({
      assessmentId: 'anatomia-1/certamen-1',
      decks: [{ apkg: 'mazos/Mazo de prueba.apkg' }],
    }),
  );
});

afterAll(() => rm(root, { recursive: true, force: true }));

let out: string[];
let errors: string[];
let warnings: string[];

beforeEach(() => {
  out = [];
  errors = [];
  warnings = [];
  drafts.saves.length = 0;
  drafts.rpcs.length = 0;
  drafts.rpcError = null;
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void out.push(a.join(' ')));
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void errors.push(a.join(' ')));
  vi.spyOn(console, 'warn').mockImplementation(
    (...a: unknown[]) => void warnings.push(a.join(' ')),
  );
});

afterEach(async () => {
  await rm(join(content, 'unpublished.json'), { force: true });
  process.exitCode = undefined;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

let run = 0;
const args = (...extra: string[]) => {
  run++;
  return [
    '--content',
    content,
    '--root',
    root,
    '--output',
    join(root, `.out-${run}`),
    '--cache',
    join(root, '.cache-run'),
    ...extra,
  ];
};

describe('runImport to the folder', () => {
  it('the help is all it prints, before anything is read', async () => {
    await runImport(['--help']);
    expect(out).toEqual([HELP]);
  });

  it('builds everything, writes content.json and prints the progress and the summary; the exit code stays clear', async () => {
    const argv = args();
    await runImport(argv);
    const output = argv[argv.indexOf('--output') + 1]!;
    const saved = JSON.parse(await readFile(join(output, 'content.json'), 'utf8')) as {
      notes: unknown[];
    };
    expect(saved.notes).toHaveLength(2);
    expect(out).toContain('· AP-BC-C2-11 · Traducción');
    const summary = out.at(-1)!;
    expect(summary).toContain('Todas las evaluaciones.');
    expect(summary).toContain('2 apuntes: 2 con cambios, 0 iguales, 0 quitados.');
    expect(summary).toContain('1 mazos de Anki'.replace('1 mazos', '7 mazos'));
    expect(summary).not.toContain('En el borrador');
    expect(process.exitCode).toBeUndefined();
  });

  it('--assessment limits what it builds and says so; --only keeps the notes it did not bring', async () => {
    await runImport(args('--assessment', 'anatomia-1/certamen-1'));
    expect(out.at(-1)).toContain('Solo: anatomia-1/certamen-1.');
    expect(out.at(-1)).toContain('0 apuntes');
    out.length = 0;
    const second = args('--only', 'AP-BC-C2-11');
    await runImport(second);
    expect(out.at(-1)).toContain('1 apuntes: 1 con cambios');
    expect(out.at(-1)).toContain('Mazos de Anki: sin tocar.');
    const output = second[second.indexOf('--output') + 1]!;
    expect(
      (JSON.parse(await readFile(join(output, 'content.json'), 'utf8')) as { notes: unknown[] })
        .notes,
    ).toHaveLength(1);
  });

  it('a build with warnings still writes to the folder, but ends with exit code 2 and lists them', async () => {
    const none = join(root, 'ninguna.json');
    await writeFile(none, JSON.stringify({ cards: [{ guid: 'no-existe', ord: 0 }] }));
    const withWarning = join(root, 'content-aviso');
    await mkdir(join(withWarning, 'decks'), { recursive: true });
    await writeFile(join(withWarning, 'catalog.json'), JSON.stringify(manifest.catalog));
    await writeFile(
      join(withWarning, 'decks/a1.json'),
      JSON.stringify({
        assessmentId: 'anatomia-1/certamen-1',
        decks: [{ apkg: 'mazos/Mazo de prueba.apkg', excludeCards: none }],
      }),
    );
    await runImport(args('--content', withWarning));
    expect(process.exitCode).toBe(2);
    expect(warnings[0]).toMatch(
      /^\n⚠ 1 avisos:\n {2}- Mazo de prueba\.apkg: «excludeCards» no deja fuera/,
    );
  });

  it('a content folder without catalog.json is an error before the options are used', async () => {
    await expect(runImport(['--content', join(root, 'vacío')])).rejects.toThrow(
      /No encuentro el contenido en/,
    );
    await expect(runImport(['--target', 'cloud'])).rejects.toBeInstanceOf(ImportError);
  });

  it('a change of content/unpublished.json while it built stops it before writing anything', async () => {
    const argv = args();
    const output = argv[argv.indexOf('--output') + 1]!;
    const entry = {
      kind: 'note',
      id: 'AP-BC-C2-12',
      reason: 'Error grave',
      date: '2026-11-22',
    };
    (console.log as ReturnType<typeof vi.fn>).mockImplementation((line: string) => {
      out.push(line);
      writeFileSync(join(content, 'unpublished.json'), JSON.stringify({ items: [entry] }));
    });
    await expect(runImport(argv)).rejects.toThrow(/cambió mientras se armaba la importación/);
    await rm(join(content, 'unpublished.json'), { force: true });
    await expect(readFile(join(output, 'content.json'))).rejects.toThrow();
  });
});

describe('runImport to the draft', () => {
  beforeEach(() => {
    for (const [k, v] of Object.entries(CLOUD_ENV)) vi.stubEnv(k, v);
  });

  const withWarning = async () => {
    const dir = join(root, 'content-aviso-draft');
    await mkdir(join(dir, 'decks'), { recursive: true });
    await writeFile(join(dir, 'catalog.json'), JSON.stringify(manifest.catalog));
    const none = join(root, 'ninguna-draft.json');
    await writeFile(none, JSON.stringify({ cards: [{ guid: 'no-existe', ord: 0 }] }));
    await writeFile(
      join(dir, 'decks/a1.json'),
      JSON.stringify({
        assessmentId: 'anatomia-1/certamen-1',
        decks: [{ apkg: 'mazos/Mazo de prueba.apkg', excludeCards: none }],
      }),
    );
    return dir;
  };

  it('saves to the draft schema with the scope of the build, and prints where to review it', async () => {
    await runImport(args('--target', 'draft', '--assessment', 'anatomia-1/certamen-1'));
    expect(drafts.saves).toHaveLength(1);
    expect(drafts.saves[0]!.bundle).toMatchObject({ schema: 'draft' });
    expect(drafts.saves[0]!.scope).toEqual({
      notes: true,
      decks: true,
      tests: true,
      partialNotes: false,
      assessments: ['anatomia-1/certamen-1'],
      unpublished: [],
    });
    expect(out.at(-1)).toContain(
      'En el borrador: lo publicado no cambió. Revisión: https://www.quintoventriculo.cl/admin/releases',
    );
  });

  it('QV_SITE_URL says where the review is, and a partial import of notes tells the cloud so', async () => {
    vi.stubEnv('QV_SITE_URL', 'http://localhost:8788/');
    await runImport(args('--target', 'draft', '--only', 'AP-BC-C2-11'));
    expect(out.at(-1)).toContain('Revisión: http://localhost:8788/admin/releases');
    expect(drafts.saves[0]!.scope).toMatchObject({ partialNotes: true, notes: true, decks: false });
    expect(drafts.saves[0]!.scope).not.toHaveProperty('assessments');
  });

  it('with warnings nothing is uploaded and the exit code is 2, unless they are allowed', async () => {
    const content = await withWarning();
    await runImport(args('--target', 'draft', '--content', content));
    expect(drafts.saves).toEqual([]);
    expect(process.exitCode).toBe(2);
    expect(errors[0]).toMatch(
      /1 avisos; no se subió nada \(usa --allow-warnings para subir igual\)/,
    );
    process.exitCode = undefined;
    await runImport(args('--target', 'draft', '--content', content, '--allow-warnings'));
    expect(drafts.saves).toHaveLength(1);
    expect(process.exitCode).toBe(2);
    expect(warnings[0]).toContain('1 avisos:');
  });

  it('--reset-draft empties the draft first; if the database refuses, nothing is saved', async () => {
    await runImport(args('--target', 'draft', '--reset-draft'));
    expect(drafts.rpcs).toEqual([{ fn: 'reset_draft', args: {} }]);
    expect(out).toContain('· borrador igual a lo publicado (reset_draft)');
    expect(drafts.saves).toHaveLength(1);
    drafts.saves.length = 0;
    drafts.rpcError = 'sin permiso';
    await expect(runImport(args('--target', 'draft', '--reset-draft'))).rejects.toMatchObject({
      kind: 'cloud',
      message: 'reset_draft: sin permiso',
    });
    expect(drafts.saves).toEqual([]);
  });

  it('without the cloud variables the draft cannot be reached, and it says which are missing', async () => {
    vi.stubEnv('R2_BUCKET', '');
    await expect(runImport(args('--target', 'draft'))).rejects.toThrow(
      'Faltan variables de entorno: R2_BUCKET',
    );
  });
});

describe('pathsOf', () => {
  it('the material is in the folder that holds the repository, the dry run in .output and the cache in .cache/images', () => {
    expect(pathsOf({ root: undefined, output: undefined, cache: undefined }, '/a/b/repo')).toEqual({
      root: '/a/b',
      output: '/a/b/repo/.output',
      cache: '/a/b/repo/.cache/images',
    });
  });

  it('an option wins; a relative one is from the repository, except the material’s, which is from where the command runs', () => {
    expect(pathsOf({ root: '/otro', output: 'salida', cache: '/c' }, '/a/b/repo')).toEqual({
      root: '/otro',
      output: '/a/b/repo/salida',
      cache: '/c',
    });
  });
});

describe('runImport with a taxonomy', () => {
  it('prints the notices of the taxonomy after the summary, and they do not change the exit code', async () => {
    const taxonomyRoot = await taxonomyFixtures.createRoot();
    const folder = join(taxonomyRoot, 'content');
    const m = taxonomyFixtures.manifest();
    try {
      for (const dir of ['notes', 'decks', 'tests', 'taxonomy', 'topic-map']) {
        await mkdir(join(folder, dir), { recursive: true });
      }
      await writeFile(join(folder, 'catalog.json'), JSON.stringify(m.catalog));
      await writeFile(join(folder, 'notes/n.json'), JSON.stringify(m.notes[0]));
      await writeFile(join(folder, 'decks/d.json'), JSON.stringify(m.decks[0]));
      await writeFile(join(folder, 'tests/t.json'), JSON.stringify(m.tests![0]));
      const file = 'anatomia-1-certamen-1.json';
      await writeFile(join(folder, 'taxonomy', file), JSON.stringify(m.taxonomies![0]!.taxonomy));
      await writeFile(join(folder, 'topic-map', file), JSON.stringify(m.taxonomies![0]!.map));
      await runImport([
        '--content',
        folder,
        '--root',
        taxonomyRoot,
        '--output',
        join(taxonomyRoot, '.out'),
        '--cache',
        join(taxonomyRoot, '.cache'),
      ]);
      expect(out.at(-1)).toMatch(
        /^\nⓘ \d+ avisos de la taxonomía \(no frenan la importación\):\n {2}- anatomia-1\/certamen-1: /,
      );
      expect(out.at(-2)).toContain('Taxonomía de anatomia-1/certamen-1: versión 1');
      expect(process.exitCode).toBeUndefined();
    } finally {
      await rm(taxonomyRoot, { recursive: true, force: true });
    }
  });
});
