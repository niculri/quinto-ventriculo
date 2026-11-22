// Tests for the test-names command: what it reads from git and the disk, and the code it leaves.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runCli } from './runCli';

let root: string;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'qv-test-names-'));
  for (const f of [
    'src/foo.ts',
    'src/Bar.ts',
    'src/__tests__/foo.test.ts',
    'src/__tests__/Bar.test.ts',
  ]) {
    mkdirSync(dirname(join(root, f)), { recursive: true });
    writeFileSync(join(root, f), '');
  }
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

const run = (listing: string | null) =>
  runCli(() => import('../testNamesCli'), {
    mocks: {
      '../gitBase': () => ({ git: () => listing }),
      '../repositoryRoot': () => ({ repositoryRoot: () => root }),
    },
  });

describe('npm run test-names', () => {
  it('passes when every test is in __tests__ and named after its source', async () => {
    const r = await run('src/foo.ts\nsrc/__tests__/foo.test.ts\n');
    expect(r).toMatchObject({ out: ['Nombres de pruebas: todas siguen la regla.'], code: 0 });
  });

  it('a file that git lists but that is no longer on the disk is not judged', async () => {
    const r = await run('src/foo.ts\nsrc/__tests__/foo.test.ts\nsrc/gone.test.ts\n');
    expect(r.code).toBe(0);
  });

  it('the source must be in the list of git, not only on the disk (macOS accepts another case)', async () => {
    const r = await run('src/__tests__/Bar.test.ts\n');
    expect(r.code).toBe(1);
    expect(r.err.join('\n')).toContain('  src/__tests__/Bar.test.ts');
  });

  it('a test next to its source instead of in __tests__ leaves 1 and names the file', async () => {
    writeFileSync(join(root, 'src/foo.test.ts'), '');
    const r = await run('src/foo.ts\nsrc/foo.test.ts\n');
    expect(r.code).toBe(1);
    expect(r.err[0]).toContain('(1)');
    expect(r.err[1]).toBe('  src/foo.test.ts');
  });

  it('with no answer from git there is nothing to judge', async () => {
    expect((await run(null)).code).toBe(0);
  });
});
