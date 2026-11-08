// Step 1.7, part 3: `--target cloud` no longer exists (the importer writes only in the draft; publishing is the
// panel's). Whoever runs the old command is told where it went, before anything is built or written.
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '../../..');
const run = (...args: string[]) => {
  try {
    execFileSync(
      join(REPO, 'node_modules/.bin/tsx'),
      [join(REPO, 'packages/importer/src/cli.ts'), ...args],
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

  it('without content/ (it lives in the private repository, step 2.4) it says where it looks for it', () => {
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
