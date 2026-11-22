// Tests for the lint ratchet and for where it runs.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { missingBase, parseBaseArgs } from '../gitBase';
import { repositoryRoot } from '../repositoryRoot';
import {
  ALL_RULES,
  changesLintSetup,
  checkRatchet,
  directivesByRule,
  localRuleFile,
  newLocalRules,
  startingDebt,
  suppressionsByRule,
  total,
} from '../suppressions';
import type { Counts, Snapshot } from '../suppressions';

const file = (entries: Record<string, Record<string, number>>) =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(entries).map(([path, rules]) => [
        path,
        Object.fromEntries(Object.entries(rules).map(([rule, count]) => [rule, { count }])),
      ]),
    ),
  );
const snap = (suppressions: string | null, inline: Record<string, number> = {}): Snapshot => ({
  suppressions,
  inline: new Map(Object.entries(inline)),
});
const asObject = (counts: Counts) => Object.fromEntries(counts);
// Written in pieces so that this file has no directive of its own.
const DISABLE = 'eslint-' + 'disable';

describe('suppressionsByRule', () => {
  it('adds up the counts of every file, per rule', () => {
    const byRule = suppressionsByRule(
      file({ 'a.ts': { 'max-lines': 1, complexity: 2 }, 'b.ts': { complexity: 3 } }),
    );
    expect(asObject(byRule)).toEqual({ 'max-lines': 1, complexity: 5 });
    expect(total(byRule)).toBe(6);
  });

  it('rejects a file that is not what ESLint writes', () => {
    expect(() => suppressionsByRule('[]')).toThrow();
    expect(() => suppressionsByRule('{"a.ts": {"max-lines": {"count": -1}}}')).toThrow();
    expect(() => suppressionsByRule('{"a.ts": {"max-lines": {}}}')).toThrow();
    expect(asObject(suppressionsByRule('{"a.ts": {"max-lines": {"count": 0}}}'))).toEqual({
      'max-lines': 0,
    });
    expect(() => suppressionsByRule('{"a.ts": {"max-lines": 3}}')).toThrow('no tiene un count');
    expect(() => suppressionsByRule('{"a.ts": {"max-lines": {"count": 1.5}}}')).toThrow();
    expect(() => suppressionsByRule('{"a.ts": 4}')).toThrow('«a.ts» no es un objeto');
    expect(() => suppressionsByRule('{"a.ts": [1]}')).toThrow('«a.ts» no es un objeto');
  });
});

describe('startingDebt', () => {
  it('lists the rules of the working tree that the base did not list', () => {
    const now = JSON.stringify({ 'rule/a': 4, 'rule/b': 1 });
    expect([...startingDebt(now, JSON.stringify({ 'rule/a': 9 }))]).toEqual([['rule/b', 1]]);
    expect([...startingDebt(now, null)]).toEqual([
      ['rule/a', 4],
      ['rule/b', 1],
    ]);
    expect([...startingDebt(null, now)]).toEqual([]);
  });

  it('a rule may start with no debt at all, and a count has to be a whole number', () => {
    expect([...startingDebt(JSON.stringify({ 'rule/a': 0 }), null)]).toEqual([['rule/a', 0]]);
    expect(() => startingDebt(JSON.stringify({ 'rule/a': 1.5 }), null)).toThrow('número válido');
    expect(() => startingDebt(JSON.stringify({ 'rule/a': -1 }), null)).toThrow('número válido');
  });

  it('rejects a file that is not a rule → count object', () => {
    expect(() => startingDebt('[]', null)).toThrow(/no es un objeto/);
    expect(() => startingDebt('{"rule/a": -1}', null)).toThrow(/número válido/);
    expect(() => startingDebt('{"rule/a": "3"}', null)).toThrow(/número válido/);
  });
});

describe('changesLintSetup', () => {
  it('is true when the change touches the ESLint configuration, its plugin or a dependency', () => {
    expect(changesLintSetup(['apps/web/src/a.ts', 'eslint.config.js'])).toBe(true);
    expect(changesLintSetup(['eslintWebLayers.js'])).toBe(true);
    expect(changesLintSetup(['packages/eslint-plugin/src/fileHeader.js'])).toBe(true);
    expect(changesLintSetup(['package-lock.json'])).toBe(true);
    expect(changesLintSetup(['apps/web/package.json'])).toBe(true);
  });

  it('is false when it touches only code, tests and the two suppression files', () => {
    expect(
      changesLintSetup([
        'eslint-suppressions.json',
        'eslintSuppressionsStart.json',
        'apps/web/src/a.ts',
        'packages/ops/src/suppressions.ts',
        'docs/eslint.config.js.md',
      ]),
    ).toBe(false);
    expect(changesLintSetup([])).toBe(false);
  });
});

describe('directivesByRule', () => {
  it('counts each rule of each directive, without its description', () => {
    const source = [
      `// ${DISABLE}-next-line max-lines-per-function`,
      `foo(); // ${DISABLE}-line no-console, max-lines -- a reason`,
      `/* ${DISABLE} @typescript-eslint/no-explicit-any -- free-form JSON */`,
      `/* ${DISABLE} */`,
      `//${DISABLE}-next-line`,
      `// see the ${DISABLE} directives (prose, not a directive)`,
      `// ${DISABLE}d is not a directive`,
    ].join('\n');
    expect(asObject(directivesByRule(source))).toEqual({
      'max-lines-per-function': 1,
      'no-console': 1,
      'max-lines': 1,
      '@typescript-eslint/no-explicit-any': 1,
      [ALL_RULES]: 2,
    });
  });
});

describe('checkRatchet', () => {
  const base = file({ 'a.ts': { 'max-lines': 2 }, 'b.ts': { complexity: 1 } });

  it('the first time (no suppressions file in the base), only the inline directives are compared', () => {
    expect(checkRatchet(snap(file({ 'a.ts': { 'max-lines': 9 } })), snap(null), 'main').ok).toBe(
      true,
    );
    const result = checkRatchet(snap(null, { 'max-lines': 1 }), snap(null), 'main');
    expect(result.ok).toBe(false);
    expect(result.lines.join('\n')).toContain('max-lines: 0 → 1');
  });

  it('passes when every rule stays the same or goes down', () => {
    expect(checkRatchet(snap(base), snap(base), 'main').ok).toBe(true);
    expect(checkRatchet(snap(file({ 'a.ts': { 'max-lines': 2 } })), snap(base), 'main').ok).toBe(
      true,
    );
    expect(checkRatchet(snap(null), snap(base), 'main').ok).toBe(true);
  });

  it('passes when a file moves with the same suppressions', () => {
    const moved = file({ 'c.ts': { 'max-lines': 2 }, 'b.ts': { complexity: 1 } });
    expect(checkRatchet(snap(moved), snap(base), 'main').ok).toBe(true);
  });

  it('fails when a rule grows, even if another one goes down by as much', () => {
    const swapped = file({ 'a.ts': { 'max-lines': 1 }, 'b.ts': { complexity: 2 } });
    const result = checkRatchet(snap(swapped), snap(base), 'main');
    expect(result.ok).toBe(false);
    expect(result.lines.join('\n')).toContain('complexity: 1 → 2');
    expect(result.lines.join('\n')).not.toContain('max-lines:');
  });

  it('a rule that the base did not have does not count as growth; once in the base, it does', () => {
    const now = file({
      'a.ts': { 'max-lines': 2, 'qv/file-header': 7 },
      'b.ts': { complexity: 1 },
    });
    const fresh = checkRatchet(snap(now), snap(base), 'main', new Set(['qv/file-header']));
    expect(fresh.ok).toBe(true);
    expect(fresh.lines.join('\n')).toContain('qv/file-header: 7');
    const grown = checkRatchet(
      snap(now, { complexity: 1 }),
      snap(base),
      'main',
      new Set(['qv/file-header']),
    );
    expect(grown.ok).toBe(false);
    expect(grown.lines.join('\n')).toContain('complexity: 1 → 2');
    expect(grown.lines.join('\n')).not.toContain('qv/file-header: 0');
    expect(checkRatchet(snap(now), snap(base), 'main').ok).toBe(false);
  });

  it("only this repository's own rules can be new, by the file of the rule", () => {
    expect(localRuleFile('qv/file-header')).toBe('packages/eslint-plugin/src/fileHeader.js');
    expect(localRuleFile('qv/no-history-comments')).toBe(
      'packages/eslint-plugin/src/noHistoryComments.js',
    );
    for (const rule of ['max-lines', 'sonarjs/cognitive-complexity', 'qv/../x', ALL_RULES]) {
      expect(localRuleFile(rule)).toBeNull();
    }
  });

  it('a rule is new only with its file in the working tree and not in the base', () => {
    const tree = new Set([
      'packages/eslint-plugin/src/fileHeader.js',
      'packages/eslint-plugin/src/old.js',
    ]);
    const base = new Set(['packages/eslint-plugin/src/old.js']);
    const found = newLocalRules(
      ['qv/file-header', 'qv/old', 'qv/elsewhere', 'max-lines'],
      (path) => base.has(path),
      (path) => tree.has(path),
    );
    expect([...found]).toEqual(['qv/file-header']);
  });

  it('a new rule may start in the suppressions file, never with an inline directive', () => {
    const fresh = new Set(['qv/new']);
    const inFile = checkRatchet(
      snap(file({ 'a.ts': { 'max-lines': 2 }, 'b.ts': { 'qv/new': 3 } })),
      snap(base),
      'main',
      fresh,
    );
    const inline = checkRatchet(snap(base, { 'qv/new': 1 }), snap(base), 'main', fresh);
    expect(inFile.ok).toBe(true);
    expect(inline.ok).toBe(false);
    expect(inline.lines.join('\n')).toContain('qv/new: 0 → 1');
  });

  it('a rule listed as starting may have that much debt once, only if the base had none of it', () => {
    const starts = new Map([['@typescript-eslint/no-unsafe-call', 3]]);
    const base = file({ 'a.ts': { 'max-lines': 1 } });
    const at = (n: number) =>
      file({ 'a.ts': { 'max-lines': 1, '@typescript-eslint/no-unsafe-call': n } });
    const within = checkRatchet(snap(at(3)), snap(base), 'main', new Set(), starts);
    expect(within.ok).toBe(true);
    expect(within.lines.join('\n')).toContain('@typescript-eslint/no-unsafe-call: 3');
    const over = checkRatchet(snap(at(4)), snap(base), 'main', new Set(), starts);
    expect(over.ok).toBe(false);
    expect(over.lines.join('\n')).toContain('@typescript-eslint/no-unsafe-call: 0 → 4');
    const inline = checkRatchet(
      snap(at(2), { '@typescript-eslint/no-unsafe-call': 1 }),
      snap(base),
      'main',
      new Set(),
      starts,
    );
    expect(inline.ok).toBe(false);
    const once = checkRatchet(snap(at(3)), snap(at(2)), 'main', new Set(), starts);
    expect(once.ok).toBe(false);
    expect(once.lines.join('\n')).toContain('@typescript-eslint/no-unsafe-call: 2 → 3');
  });

  it('lists the rules in alphabetical order, both the ones that grew and the new ones', () => {
    const base = file({ 'a.ts': { b: 1, a: 1, z: 1, y: 1 } });
    const grew = file({ 'a.ts': { b: 2, a: 2, z: 2, y: 2 } });
    const grown = checkRatchet(snap(grew), snap(base), 'main').lines;
    expect(grown.filter((l) => /^ {2}\w:/.test(l)).map((l) => l.trim()[0])).toEqual([
      'a',
      'b',
      'y',
      'z',
    ]);
    const fresh = checkRatchet(
      snap(file({ 'a.ts': { z: 1, y: 1 } })),
      snap(file({ 'a.ts': { b: 1 } })),
      'main',
      new Set(['z', 'y']),
    ).lines;
    expect(fresh.join('\n')).toContain('y: 1, z: 1');
  });

  it('an inline directive counts as a suppression of its rule', () => {
    const moved = checkRatchet(
      snap(file({ 'b.ts': { complexity: 1 } }), { 'max-lines': 2 }),
      snap(base),
      'main',
    );
    expect(moved.ok).toBe(true);
    const extra = checkRatchet(snap(base, { complexity: 1 }), snap(base), 'main');
    expect(extra.ok).toBe(false);
    expect(extra.lines.join('\n')).toContain(
      'complexity: 1 → 2 (1 en eslint-suppressions.json, 1 con',
    );
  });
});

describe('the base', () => {
  it('origin/main by default; --base and --require-base; the CI always requires it', () => {
    expect(parseBaseArgs([], {})).toEqual({ base: 'origin/main', required: false });
    expect(parseBaseArgs(['--base', 'abc', '--require-base'], {})).toEqual({
      base: 'abc',
      required: true,
    });
    expect(parseBaseArgs([], { CI: 'true' })?.required).toBe(true);
    expect(parseBaseArgs(['--base'], {})).toBeNull();
  });

  it('a missing base fails where it is required and only warns elsewhere', () => {
    expect(missingBase({ base: 'x', required: true }, 'Supresiones').fail).toBe(true);
    expect(missingBase({ base: 'x', required: false }, 'Supresiones').fail).toBe(false);
  });
});

describe('where the ratchets run', () => {
  const read = (...path: string[]) => readFileSync(join(repositoryRoot(), ...path), 'utf8');

  it('the CI and the pre-push hook run them, and npm run check too', () => {
    const ci = read('.github', 'workflows', 'ci.yml');
    expect(ci).toContain('npm run --silent suppressions -- --base');
    expect(ci).toContain('npm run --silent deps -- --base');
    const hook = read('.githooks', 'pre-push');
    expect(hook).toContain('npm run --silent suppressions');
    expect(hook).toContain('npm run --silent deps');
    const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> })
      .scripts;
    expect(scripts.check).toContain('npm run suppressions');
    expect(scripts.check).toContain('npm run deps');
  });

  it('npm run lint fails on suppressions and inline directives that are no longer needed', () => {
    const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> })
      .scripts;
    expect(scripts.lint).not.toContain('--pass-on-unpruned-suppressions');
    expect(scripts.suppressions).toContain('suppressionsCli.ts');
    expect(read('eslint.config.js')).toContain("reportUnusedDisableDirectives: 'error'");
  });

  it('in the CI, a base that cannot be fetched fails the step', () => {
    const ci = read('.github', 'workflows', 'ci.yml');
    expect(ci).toMatch(/git fetch[^\n]*"\$BASE_SHA"/);
    expect(ci).not.toMatch(/git fetch[^\n]*\|\|/);
  });
});
