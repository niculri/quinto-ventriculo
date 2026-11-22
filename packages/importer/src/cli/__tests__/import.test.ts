// Tests the importer CLI's answers to a removed or unknown target and to a missing content folder, which come before
// anything is built or written.
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const REPO = resolve(import.meta.dirname, '../../../../..');
const run = (...args: string[]) => {
  try {
    execFileSync(
      join(REPO, 'node_modules/.bin/tsx'),
      [join(REPO, 'packages/importer/src/cli/import.ts'), ...args],
      {
        cwd: REPO,
        env: { PATH: process.env.PATH ?? '' },
        stdio: 'pipe',
      },
    );
    return { code: 0, err: '' };
  } catch (e) {
    const x = e as { status: number; stderr: Buffer };
    return { code: x.status, err: x.stderr.toString('utf8') };
  }
};

describe('the importer’s targets', () => {
  it('--target cloud says where publishing went, and writes nothing', () => {
    const r = run('--target', 'cloud');
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/--target cloud ya no existe/);
    expect(r.err).toMatch(/--target draft/);
    expect(r.err).toMatch(/Publicaciones/);
  });

  it('without content/ (it lives in the private repository) it says where it looks for it', () => {
    const r = run('--content', '/nonexistent/content');
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/No encuentro el contenido en \/nonexistent\/content/);
    expect(r.err).toMatch(/quinto-ventriculo-privado\/content/);
    expect(r.err).toMatch(/QV_CONTENT_DIR/);
  });

  it('another target is unknown, before building anything', () => {
    const r = run('--target', 'public');
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/Destino desconocido: public/);
  });
});

describe('the command file', () => {
  afterEach(() => {
    process.exitCode = undefined;
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock('../runImport');
  });

  const enter = async (result: () => Promise<void>) => {
    vi.doMock('../runImport', () => ({ runImport: result }));
    const errors: unknown[] = [];
    vi.spyOn(console, 'error').mockImplementation((e: unknown) => void errors.push(e));
    await import('../import');
    await new Promise((r) => setImmediate(r));
    return errors;
  };

  it('a run that ends well prints nothing and leaves the exit code alone', async () => {
    expect(await enter(() => Promise.resolve())).toEqual([]);
    expect(process.exitCode).toBeUndefined();
  });

  it('an error is printed as its message, and the exit code is 1', async () => {
    expect(await enter(() => Promise.reject(new Error('algo falló')))).toEqual(['algo falló']);
    expect(process.exitCode).toBe(1);
  });

  it('what is thrown that is not an error is printed as it is', async () => {
    expect(
      await enter(async () => {
        throw 'un texto' as unknown as Error;
      }),
    ).toEqual(['un texto']);
    expect(process.exitCode).toBe(1);
  });
});
