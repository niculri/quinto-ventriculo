// Tests for the suppressions command: what it reads from the working tree and from the base commit, and the code it
// leaves. Git is replaced; the folder with its files is real.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCli } from './runCli';

let root: string;
const SUPPRESSIONS = 'eslint-suppressions.json';
const START = 'eslintSuppressionsStart.json';
// Written in pieces so that this file has no directive of its own.
const DISABLE = 'eslint-' + 'disable';
const counts = (rules: Record<string, number>) =>
  JSON.stringify({
    'a.ts': Object.fromEntries(Object.entries(rules).map(([r, count]) => [r, { count }])),
  });
const write = (path: string, text: string) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
};

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'qv-suppressions-'));
});
afterAll(() => rmSync(root, { recursive: true, force: true }));
beforeEach(() => {
  for (const f of [SUPPRESSIONS, START, 'packages'])
    rmSync(join(root, f), { recursive: true, force: true });
});

interface World {
  baseExists?: boolean;
  grepNow?: string | null;
  grepBase?: string | null;
  changed?: string | null;
  atBase?: Record<string, string>;
}

async function run(argv: string[], world: World = {}) {
  const gitCalls: string[][] = [];
  const result = await runCli(() => import('../suppressionsCli'), {
    argv,
    mocks: {
      '../repositoryRoot': () => ({ repositoryRoot: () => root }),
      '../gitBase': async () => ({
        ...(await vi.importActual<object>('../gitBase')),
        baseExists: () => world.baseExists ?? true,
        readAtBase: (_root: string, _base: string, path: string) => world.atBase?.[path] ?? null,
        git: (_root: string, args: string[]) => {
          gitCalls.push(args);
          if (args[0] === 'diff') return world.changed === undefined ? '' : world.changed;
          const grep = args.includes('--untracked') ? world.grepNow : world.grepBase;
          return grep === undefined ? '' : grep;
        },
      }),
    },
  });
  return { ...result, gitCalls };
}

describe('npm run suppressions', () => {
  it('compares the working tree with the base: the same totals pass and print their summary', async () => {
    write(SUPPRESSIONS, counts({ 'max-lines': 2 }));
    const r = await run([], { atBase: { [SUPPRESSIONS]: counts({ 'max-lines': 2 }) } });
    expect(r.code).toBe(0);
    expect(r.out[0]).toBe('Supresiones de ESLint: 2 (en origin/main: 2).');
  });

  it('counts the directives of the tracked and untracked sources, against those of the base commit', async () => {
    write(SUPPRESSIONS, counts({}));
    const base = {
      atBase: { [SUPPRESSIONS]: counts({}) },
      grepBase: `// ${DISABLE}-next-line no-console`,
    };
    const grew = await run([], {
      ...base,
      grepNow: `// ${DISABLE}-next-line no-console\nfoo(); // ${DISABLE}-line no-console`,
    });
    expect(grew.code).toBe(1);
    expect(grew.err.join('\n')).toContain('no-console: 1 → 2');
    const grep = grew.gitCalls.filter((c) => c[0] === 'grep');
    expect(grep[0]).toContain('--untracked');
    expect(grep[1]).toContain('origin/main');
  });

  it('a rule that grew leaves 1 and names it; one that only moved between files does not', async () => {
    write(SUPPRESSIONS, counts({ 'max-lines': 3 }));
    const r = await run(['--base', 'abc'], {
      atBase: { [SUPPRESSIONS]: counts({ 'max-lines': 2 }) },
    });
    expect(r.code).toBe(1);
    expect(r.err[0]).toContain('respecto de abc');
    expect(r.err[1]).toContain('max-lines: 2 → 3');
  });

  it('no output of git grep (it exits with 1 when nothing matches) is no directive', async () => {
    write(SUPPRESSIONS, counts({}));
    const r = await run([], {
      atBase: { [SUPPRESSIONS]: counts({}) },
      grepNow: null,
      grepBase: null,
    });
    expect(r.code).toBe(0);
  });

  it('a bad --base leaves 2 with the usage', async () => {
    const r = await run(['--base']);
    expect(r.code).toBe(2);
    expect(r.err[0]).toContain('Uso: npm run suppressions');
  });

  it('a base that is not there only warns, unless it is required', async () => {
    const warns = await run([], { baseExists: false });
    expect(warns.code).toBe(0);
    expect(warns.warn[0]).toContain('Supresiones de ESLint: no encuentro «origin/main»');
    const fails = await run(['--require-base'], { baseExists: false });
    expect(fails.code).toBe(1);
    expect(fails.err[0]).toContain('sin la base no se puede comprobar');
  });

  describe('rules that start with debt', () => {
    const rule = 'qv/new-rule';
    const file = 'packages/eslint-plugin/src/newRule.js';

    it('a local rule whose file is new may start with its suppressions, and says so', async () => {
      write(SUPPRESSIONS, counts({ [rule]: 7 }));
      write(file, '');
      const r = await run([], { atBase: { [SUPPRESSIONS]: counts({}) } });
      expect(r.code).toBe(0);
      expect(r.out.join('\n')).toContain(
        `Reglas nuevas respecto de origin/main (no cuentan esta vez): ${rule}: 7.`,
      );
    });

    it('the same suppressions without the rule file in the tree, or with it already in the base, are growth', async () => {
      write(SUPPRESSIONS, counts({ [rule]: 7 }));
      expect((await run([], { atBase: { [SUPPRESSIONS]: counts({}) } })).code).toBe(1);
      write(file, '');
      expect((await run([], { atBase: { [SUPPRESSIONS]: counts({}), [file]: '' } })).code).toBe(1);
    });

    it('with the suppressions file missing, only its inline directives count', async () => {
      write(file, '');
      const r = await run([], {
        atBase: { [SUPPRESSIONS]: counts({}) },
        grepNow: `// ${DISABLE} ${rule}`,
      });
      expect(r.code).toBe(1);
      expect(r.err.join('\n')).toContain(`${rule}: 0 → 1`);
    });

    it('a rule listed in the start file may start with that debt, only if the change touches the lint setup', async () => {
      write(SUPPRESSIONS, counts({ 'some/rule': 3 }));
      write(START, JSON.stringify({ 'some/rule': 3 }));
      const base = { atBase: { [SUPPRESSIONS]: counts({}) } };
      const touching = await run([], { ...base, changed: 'eslint.config.js\nsrc/a.ts\n' });
      expect(touching.code).toBe(0);
      expect(touching.out.join('\n')).toContain('some/rule: 3');
      const notTouching = await run([], { ...base, changed: 'src/a.ts\n' });
      expect(notTouching.code).toBe(1);
      expect(notTouching.gitCalls.some((c) => c[0] === 'diff' && c.includes('origin/main'))).toBe(
        true,
      );
    });

    it('a change of the lint setup without a start file starts nothing', async () => {
      write(SUPPRESSIONS, counts({ 'some/rule': 3 }));
      const r = await run([], {
        atBase: { [SUPPRESSIONS]: counts({}) },
        changed: 'package.json\n',
      });
      expect(r.code).toBe(1);
    });

    it('git failing to list the changed files is no change at all', async () => {
      write(SUPPRESSIONS, counts({ 'some/rule': 3 }));
      write(START, JSON.stringify({ 'some/rule': 3 }));
      const r = await run([], { atBase: { [SUPPRESSIONS]: counts({}) }, changed: null });
      expect(r.code).toBe(1);
    });
  });
});
