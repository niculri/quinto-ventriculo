// Tests where the private repository and the content are looked for, and when a missing one is an error.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportError } from '../ImportError';
import {
  PRIVATE_FOLDER_NAME,
  contentFolder,
  materialPath,
  privateFolder,
  privateMaterial,
  realMaterialHere,
  requireContentFolder,
} from '../privateFolder';

let base: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'qv-private-'));
});

afterEach(() => rm(base, { recursive: true, force: true }));

/** A public repository `<base>/publico` with its private neighbour, with or without `content/catalog.json`. */
async function layout(withCatalog: boolean, config?: object) {
  const repository = join(base, 'publico');
  const folder = join(base, PRIVATE_FOLDER_NAME);
  await mkdir(join(folder, 'content'), { recursive: true });
  await mkdir(join(folder, 'tests'), { recursive: true });
  await mkdir(repository, { recursive: true });
  if (withCatalog) await writeFile(join(folder, 'content', 'catalog.json'), '{}');
  if (config) await writeFile(join(folder, 'tests', 'real-material.json'), JSON.stringify(config));
  return { repository, folder };
}

describe('privateFolder and contentFolder', () => {
  it('the private repository is the neighbour of the public one, unless QV_PRIVATE_DIR says another', () => {
    expect(privateFolder({}, join(base, 'publico'))).toBe(join(base, PRIVATE_FOLDER_NAME));
    expect(privateFolder({ QV_PRIVATE_DIR: join(base, 'otro') }, join(base, 'publico'))).toBe(
      join(base, 'otro'),
    );
  });

  it('the content is, in this order: the option, QV_CONTENT_DIR, the content of the private repository', () => {
    const env = { QV_CONTENT_DIR: join(base, 'env') };
    expect(contentFolder('rel', env, base)).toBe(resolve('rel'));
    expect(contentFolder(undefined, env, base)).toBe(join(base, 'env'));
    expect(contentFolder(undefined, {}, join(base, 'publico'))).toBe(
      join(base, PRIVATE_FOLDER_NAME, 'content'),
    );
    expect(contentFolder('', {}, join(base, 'publico'))).toBe(
      join(base, PRIVATE_FOLDER_NAME, 'content'),
    );
  });

  it('a content folder needs its catalog, and the error says where it was looked for and how to point elsewhere', async () => {
    const { folder } = await layout(false);
    const content = join(folder, 'content');
    const error = (() => {
      try {
        return requireContentFolder(content);
      } catch (e) {
        return e as ImportError;
      }
    })() as ImportError;
    expect(error.kind).toBe('environment');
    expect(error.message).toContain(`No encuentro el contenido en ${content}`);
    expect(error.message).toContain('--content <carpeta>');
    await writeFile(join(content, 'catalog.json'), '{}');
    expect(requireContentFolder(content)).toBe(content);
  });
});

describe('privateMaterial', () => {
  it('without the private repository the checks are skipped, and the reason says where it was looked for', async () => {
    const { repository, folder } = await layout(false);
    const m = privateMaterial({}, repository);
    expect(m).toMatchObject({ folder: null, content: null, config: null, root: base });
    expect(m.skipReason).toContain(folder);
  });

  it('with QV_REQUIRE_PRIVATE=1 a missing private repository, or a missing config, is an error', async () => {
    const { repository } = await layout(false);
    expect(() => privateMaterial({ QV_REQUIRE_PRIVATE: '1' }, repository)).toThrow(
      /QV_REQUIRE_PRIVATE=1 y no está el repositorio privado/,
    );
    await writeFile(join(base, PRIVATE_FOLDER_NAME, 'content', 'catalog.json'), '{}');
    expect(() => privateMaterial({ QV_REQUIRE_PRIVATE: '1' }, repository)).toThrow(
      /QV_REQUIRE_PRIVATE=1 y falta .*real-material\.json/,
    );
  });

  it('with the repository but without the config it is skipped for that reason, unless it is required', async () => {
    const { repository, folder } = await layout(true);
    const m = privateMaterial({}, repository);
    expect(m).toMatchObject({ folder, content: join(folder, 'content'), config: null });
    expect(m.skipReason).toBe('falta tests/real-material.json en el repositorio privado');
  });

  it('with the config it is read, the skip reason is empty and QV_MATERIAL_DIR moves the material root', async () => {
    const { repository } = await layout(true, { html: { material: 'm', digests: {} } });
    const m = privateMaterial(
      { QV_MATERIAL_DIR: join(base, 'material'), QV_REQUIRE_PRIVATE: '1' },
      repository,
    );
    expect(m.config).toEqual({ html: { material: 'm', digests: {} } });
    expect(m).toMatchObject({ skipReason: '', root: join(base, 'material') });
  });
});

describe('realMaterialHere and materialPath', () => {
  it('is true only when every path exists; with QV_REQUIRE_PRIVATE=1 a missing one is an error naming it', async () => {
    const here = join(base, 'aqui');
    await writeFile(here, '');
    const gone = join(base, 'no-esta');
    expect(realMaterialHere([here], {})).toBe(true);
    expect(realMaterialHere([here, gone], {})).toBe(false);
    expect(() => realMaterialHere([here, gone], { QV_REQUIRE_PRIVATE: '1' })).toThrow(
      new RegExp(`falta material real: ${gone}`),
    );
    expect(realMaterialHere([here], { QV_REQUIRE_PRIVATE: '1' })).toBe(true);
  });

  it('~/ is the home folder, an absolute path stays and a relative one hangs from the base', () => {
    vi.stubEnv('HOME', '/casa/yo');
    try {
      expect(materialPath('/base', '~/libros/a.pdf')).toBe('/casa/yo/libros/a.pdf');
      expect(materialPath('/base', '/abs/a.pdf')).toBe('/abs/a.pdf');
      expect(materialPath('/base', 'rel/a.pdf')).toBe('/base/rel/a.pdf');
      expect(materialPath('/base', '~otro/a.pdf')).toBe('/base/~otro/a.pdf');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('~/ without HOME falls back to the root of the path', () => {
    vi.stubEnv('HOME', undefined);
    delete process.env.HOME;
    try {
      expect(materialPath('/base', '~/a.pdf')).toBe('a.pdf');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
