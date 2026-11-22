// Tests how a test folder is read: where its question files are, in what order, and what a bad file says.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadTest } from '../load';

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'qv-load-'));
});

afterEach(() => rm(folder, { recursive: true, force: true }));

const json = async (path: string, data: unknown) => {
  await mkdir(join(folder, path, '..'), { recursive: true });
  await writeFile(join(folder, path), typeof data === 'string' ? data : JSON.stringify(data));
};

describe('loadTest', () => {
  it('without sections, every .json of preguntas/ in the order of its name, and nothing else', async () => {
    await json('test.json', { titulo: 'T' });
    await json('preguntas/10.json', { preguntas: [] });
    await json('preguntas/02.json', { preguntas: [] });
    await json('preguntas/notas.txt', 'no');
    const { cfg, groups } = await loadTest(folder);
    expect(cfg).toEqual({ titulo: 'T' });
    expect(groups.map((g) => [g.id, g.file, g.section])).toEqual([
      ['02', '02.json', null],
      ['10', '10.json', null],
    ]);
  });

  it('a test without a preguntas/ folder has no groups, which the validation reports', async () => {
    await json('test.json', { titulo: 'T' });
    expect((await loadTest(folder)).groups).toEqual([]);
  });

  it('«grupos» of test.json fixes which files, and in what order, instead of the folder listing', async () => {
    await json('test.json', { grupos: ['b/z.json', 'a/y.json'] });
    await json('a/y.json', { preguntas: [] });
    await json('b/z.json', { preguntas: [] });
    await json('preguntas/otro.json', { preguntas: [] });
    expect((await loadTest(folder)).groups.map((g) => g.id)).toEqual(['z', 'y']);
  });

  it('a file that is a bare list is the list of questions; its «id» (even a number) names the group, else its file', async () => {
    await json('test.json', {});
    await json('preguntas/a.json', [{ q: 'x' }]);
    await json('preguntas/b.json', { id: 7, preguntas: [] });
    await json('preguntas/c.json', { id: null, preguntas: [] });
    const { groups } = await loadTest(folder);
    expect(groups.map((g) => g.id)).toEqual(['a', '7', 'c']);
    expect(groups[0]!.data).toEqual({ preguntas: [{ q: 'x' }] });
  });

  it('with sections each one reads its own folder, and its groups are told apart by section and prefix', async () => {
    await json('test.json', {
      secciones: [
        { id: 'uno', carpeta: 'a' },
        { id: 'dos', carpeta: 'b' },
      ],
      grupos: ['ignorado.json'],
    });
    await json('a/01.json', { preguntas: [] });
    await json('b/01.json', { preguntas: [] });
    await json('b/02.json', { preguntas: [] });
    const { groups } = await loadTest(folder);
    expect(groups.map((g) => [g.section, g.file])).toEqual([
      ['uno', 'a/01.json'],
      ['dos', 'b/01.json'],
      ['dos', 'b/02.json'],
    ]);
  });

  it('a section without a folder or an id reads the test’s own folder, for the validation to complain about it', async () => {
    await json('test.json', { secciones: [{ nombre: 'Sin id' }] });
    await json('01.json', { preguntas: [] });
    const { groups } = await loadTest(folder);
    expect(groups.map((g) => [g.section, g.file])).toEqual([
      ['', '01.json'],
      ['', 'test.json'],
    ]);
  });

  it('an empty list of sections is the same as none', async () => {
    await json('test.json', { secciones: [] });
    await json('preguntas/01.json', { preguntas: [] });
    expect((await loadTest(folder)).groups.map((g) => g.section)).toEqual([null]);
  });

  it('a test.json that is not an object is read as an empty one', async () => {
    await json('test.json', '[1, 2]');
    expect((await loadTest(folder)).cfg).toEqual({});
  });

  it('a missing file and a broken one are errors of the material that name the path', async () => {
    await expect(loadTest(folder)).rejects.toMatchObject({
      kind: 'material',
      message: `No existe ${join(folder, 'test.json')}`,
    });
    await json('test.json', '{"titulo": ');
    await expect(loadTest(folder)).rejects.toThrow(
      new RegExp(`${join(folder, 'test.json').replaceAll('\\', '\\\\')}: JSON inválido \\(`),
    );
  });
});
