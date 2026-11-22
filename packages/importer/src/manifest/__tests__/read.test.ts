// Tests reading the content folder: what a missing piece means, what stops the import and what is not wrapped.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ImportError } from '../../ImportError';
import { manifest } from '../../test/importerFixtures';
import { readManifest, readUnpublished } from '../read';

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'qv-manifest-'));
  await writeFile(join(folder, 'catalog.json'), JSON.stringify(manifest.catalog));
});

afterEach(() => rm(folder, { recursive: true, force: true }));

const writeJson = async (path: string, data: unknown) => {
  await mkdir(join(folder, path, '..'), { recursive: true });
  await writeFile(join(folder, path), JSON.stringify(data));
};

describe('readManifest', () => {
  it('a folder with only the catalog has no notes, decks, tests or unpublished pieces', async () => {
    const read = await readManifest(folder, { history: null });
    expect(read).toMatchObject({
      notes: [],
      decks: [],
      tests: [],
      unpublished: [],
      taxonomies: [],
    });
    expect(read.catalog.courses).toHaveLength(2);
  });

  it('reads the manifests of each folder in the order of their file names, ignoring other files', async () => {
    await writeJson('notes/b.json', manifest.notes[0]);
    await writeJson('notes/a.json', { assessmentId: 'anatomia-1/certamen-1', notes: [] });
    await writeFile(join(folder, 'notes/LEEME.md'), 'not json');
    await writeJson('decks/x.json', {
      assessmentId: 'anatomia-1/certamen-1',
      decks: [{ apkg: 'mazos/a.apkg' }],
    });
    const read = await readManifest(folder, { history: null, taxonomies: false });
    expect(read.notes.map((n) => n.assessmentId)).toEqual([
      'anatomia-1/certamen-1',
      'biologia-celular/certamen-2',
    ]);
    expect(read.decks).toHaveLength(1);
    expect(read.taxonomies).toEqual([]);
  });

  it('a manifest that breaks the schema names its file; the references are checked at the end', async () => {
    await writeJson('notes/a.json', { assessmentId: 3 });
    const error = await readManifest(folder, { history: null }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ImportError);
    expect((error as ImportError).kind).toBe('manifest');
    expect((error as Error).message).toContain(join(folder, 'notes/a.json'));
    await rm(join(folder, 'notes/a.json'));
    await writeJson('notes/a.json', { assessmentId: 'no/existe', notes: [] });
    await expect(readManifest(folder, { history: null })).rejects.toThrow(
      /Manifiesto con errores:\n- No existe la evaluación no\/existe/,
    );
  });

  it('a taxonomy being edited stops the import, unless the caller asks not to read taxonomies', async () => {
    await mkdir(join(folder, 'taxonomy'), { recursive: true });
    await writeFile(join(folder, 'taxonomy', 'x.json'), '{no es json');
    await expect(readManifest(folder, { history: null })).rejects.toThrow(/no es un JSON válido/);
    expect((await readManifest(folder, { history: null, taxonomies: false })).taxonomies).toEqual(
      [],
    );
  });

  it('only a missing folder is empty: any other failure of reading it stops the import', async () => {
    await writeFile(join(folder, 'notes'), 'a file, not a folder');
    await expect(readManifest(folder, { history: null })).rejects.toMatchObject({
      code: 'ENOTDIR',
    });
  });
});

describe('readUnpublished', () => {
  it('only a missing file means an empty list; a file that cannot be read is an error', async () => {
    expect(await readUnpublished(join(folder, 'unpublished.json'))).toEqual([]);
    await expect(readUnpublished(folder)).rejects.toMatchObject({ code: 'EISDIR' });
  });
});
