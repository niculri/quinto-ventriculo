// The lint ratchet: per rule, the suppressions and the inline directives may go down, never up; the CI and the
// pre-push hook run it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { missingBase, parseBaseArgs } from './git-base';
import { repositoryRoot } from './repository-root';
import {
  ALL_RULES,
  checkRatchet,
  directivesByRule,
  suppressionsByRule,
  total,
} from './suppressions';
import type { Counts, Snapshot } from './suppressions';

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
    expect(scripts.suppressions).toContain('suppressions-cli.ts');
    expect(read('eslint.config.js')).toContain("reportUnusedDisableDirectives: 'error'");
  });

  it('in the CI, a base that cannot be fetched fails the step', () => {
    const ci = read('.github', 'workflows', 'ci.yml');
    expect(ci).toMatch(/git fetch[^\n]*"\$BASE_SHA"/);
    expect(ci).not.toMatch(/git fetch[^\n]*\|\|/);
  });
});
