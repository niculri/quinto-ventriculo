// Tests for the cycles command: what it asks dependency-cruiser, how it compares with the baseline and with the base
// commit, and the code it leaves. Dependency-cruiser and git are replaced; the folder and the baseline are real.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCli } from './runCli';

let root: string;
const BASELINE = '.import-cycles.json';
const cycle = (from: string, to: string) => ({ from, to, rule: { name: 'no-circular' } });
const cruiseOf = (...violations: ReturnType<typeof cycle>[]) =>
  JSON.stringify({ modules: [], summary: { violations } });
const baseline = (...files: string[]) => JSON.stringify({ files, folders: [] });

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'qv-cycles-'));
  for (const dir of ['packages/a/src', 'packages/b'])
    mkdirSync(join(root, dir), { recursive: true });
});
afterAll(() => rmSync(root, { recursive: true, force: true }));
beforeEach(() => rmSync(join(root, BASELINE), { force: true }));

interface World {
  spawn?: { stdout?: string; stderr?: string; error?: Error };
  baseExists?: boolean;
  atBase?: string | null;
}

async function run(argv: string[], world: World = {}, env: Record<string, string> = {}) {
  const calls: { command: string; args: string[] }[] = [];
  const result = await runCli(() => import('../cyclesCli'), {
    argv,
    env,
    mocks: {
      'node:child_process': () => ({
        spawnSync: (command: string, args: string[]) => {
          calls.push({ command, args });
          return world.spawn ?? { stdout: cruiseOf() };
        },
      }),
      '../repositoryRoot': () => ({ repositoryRoot: () => root }),
      '../gitBase': async () => ({
        ...(await vi.importActual<object>('../gitBase')),
        baseExists: () => world.baseExists ?? true,
        readAtBase: () => world.atBase ?? null,
      }),
    },
  });
  return { ...result, calls };
}

describe('npm run deps', () => {
  it('asks dependency-cruiser for the web, the API and the packages that have a src folder', async () => {
    const r = await run([]);
    expect(r.calls).toHaveLength(1);
    expect(r.calls[0]!.command).toBe(join(root, 'node_modules', '.bin', 'depcruise'));
    expect(r.calls[0]!.args).toEqual([
      'apps/web/src',
      'apps/api/src',
      'packages/a/src',
      '--output-type',
      'json',
    ]);
  });

  it('a bad --base leaves 2 with the usage, before asking anything', async () => {
    const r = await run(['--base']);
    expect(r.code).toBe(2);
    expect(r.err[0]).toContain('Uso: npm run deps');
    expect(r.calls).toEqual([]);
  });

  it('when dependency-cruiser says nothing it leaves 2 with what it knows about why', async () => {
    expect((await run([], { spawn: { stdout: '', stderr: 'boom' } })).err[0]).toContain('boom');
    expect((await run([], { spawn: { stdout: '', error: new Error('ENOENT') } })).err[0]).toContain(
      'ENOENT',
    );
    const silent = await run([], { spawn: { stdout: '' } });
    expect(silent.code).toBe(2);
    expect(silent.err[0]).toContain('dependency-cruiser no respondió');
  });

  it('--write-baseline writes the cycles it found and leaves 0, even if they are new', async () => {
    const r = await run(['--write-baseline'], {
      spawn: { stdout: cruiseOf(cycle('a.ts', 'b.ts')) },
    });
    expect(r.code).toBe(0);
    expect(r.out[0]).toBe('.import-cycles.json: 1 entre archivos y 0 entre carpetas.');
    expect(JSON.parse(readFileSync(join(root, BASELINE), 'utf8'))).toEqual({
      files: ['a.ts → b.ts'],
      folders: [],
    });
  });

  it('a cycle that is not in the baseline leaves 1 and says how to break it', async () => {
    writeFileSync(join(root, BASELINE), baseline('a.ts → b.ts'));
    const r = await run([], {
      spawn: { stdout: cruiseOf(cycle('a.ts', 'b.ts'), cycle('c.ts', 'd.ts')) },
    });
    expect(r.code).toBe(1);
    expect(r.err[0]).toContain('Ciclos de imports nuevos (1):');
    expect(r.err[0]).toContain('c.ts → d.ts');
    expect(r.err[0]).not.toContain('a.ts → b.ts');
    expect(r.err[1]).toContain('Rompe el ciclo');
  });

  it('without new cycles it counts the known ones and says when some are gone', async () => {
    writeFileSync(join(root, BASELINE), baseline('a.ts → b.ts', 'x.ts → y.ts'));
    const r = await run([], { spawn: { stdout: cruiseOf(cycle('a.ts', 'b.ts')) } });
    expect(r.code).toBe(0);
    expect(r.out[0]).toBe(
      'Ciclos de imports: ninguno nuevo (1 conocidos); 1 ya no están: npm run deps:baseline los saca.',
    );
    writeFileSync(join(root, BASELINE), baseline());
    const same = await run([], { spawn: { stdout: cruiseOf() } });
    expect(same.out[0]).toBe('Ciclos de imports: ninguno nuevo (0 conocidos).');
  });

  it('without a baseline file, every cycle is new', async () => {
    const r = await run([], { spawn: { stdout: cruiseOf(cycle('a.ts', 'b.ts')) } });
    expect(r.code).toBe(1);
  });

  describe('against the base commit', () => {
    it('a base that is not there only warns, unless it is required (and the CI requires it)', async () => {
      const warns = await run([], { baseExists: false });
      expect(warns.code).toBe(0);
      expect(warns.warn[0]).toContain('Línea base de ciclos: no encuentro «origin/main»');
      for (const r of [
        await run(['--require-base'], { baseExists: false }),
        await run([], { baseExists: false }, { CI: 'true' }),
      ]) {
        expect(r.code).toBe(1);
        expect(r.err[0]).toContain('sin la base no se puede comprobar');
      }
    });

    it('a baseline that gained keys with respect to the base fails, even without new cycles', async () => {
      writeFileSync(join(root, BASELINE), baseline('a.ts → b.ts', 'c.ts → d.ts'));
      const r = await run([], {
        spawn: { stdout: cruiseOf(cycle('a.ts', 'b.ts'), cycle('c.ts', 'd.ts')) },
        atBase: baseline('a.ts → b.ts'),
      });
      expect(r.code).toBe(1);
      expect(r.err[0]).toContain('.import-cycles.json ganó 1 ciclos respecto de origin/main');
      expect(r.err[0]).toContain('c.ts → d.ts');
    });

    it('passes when the baseline kept or lost keys, or when the base has no baseline', async () => {
      writeFileSync(join(root, BASELINE), baseline('a.ts → b.ts'));
      const found = { spawn: { stdout: cruiseOf(cycle('a.ts', 'b.ts')) } };
      expect(
        (await run([], { ...found, atBase: baseline('a.ts → b.ts', 'z.ts → y.ts') })).code,
      ).toBe(0);
      expect((await run([], { ...found, atBase: null })).code).toBe(0);
    });
  });
});
