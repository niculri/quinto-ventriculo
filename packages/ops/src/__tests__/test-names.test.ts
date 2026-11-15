// Tests the test names rule: what follows it, what is exempt, and the list that may only go down.
import { describe, expect, it } from 'vitest';
import {
  breakingRule,
  checkTestNames,
  followsRule,
  readExceptions,
  writeExceptions,
} from '../test-names';

const tree = new Set([
  'apps/web/src/shared/ui/Toast.tsx',
  'apps/web/src/shared/lib/storage.ts',
  'packages/eslint-plugin/src/file-header.js',
]);
const exists = (p: string) => tree.has(p);

describe('the test names rule', () => {
  it('a test in __tests__ named after a file of the folder above follows it', () => {
    expect(followsRule('apps/web/src/shared/ui/__tests__/Toast.test.tsx', exists)).toBe(true);
    expect(followsRule('apps/web/src/shared/lib/__tests__/storage.test.ts', exists)).toBe(true);
    expect(followsRule('packages/eslint-plugin/src/__tests__/file-header.test.ts', exists)).toBe(
      true,
    );
  });

  it('next to its file, under another name or without the file, it does not', () => {
    expect(followsRule('apps/web/src/shared/ui/Toast.test.tsx', exists)).toBe(false);
    expect(followsRule('apps/web/src/shared/ui/__tests__/toasts.test.tsx', exists)).toBe(false);
    expect(followsRule('apps/web/src/shared/__tests__/Toast.test.tsx', exists)).toBe(false);
  });

  it('flows and contract batteries are named after what they cover', () => {
    expect(followsRule('apps/web/src/features/study/__tests__/review.flow.test.tsx', exists)).toBe(
      true,
    );
    expect(followsRule('apps/web/src/features/study/review.flow.test.tsx', exists)).toBe(false);
    expect(
      followsRule('apps/web/src/features/x/api/repository/memory-contract.test.ts', exists),
    ).toBe(true);
  });

  it('only tests count, sorted', () => {
    expect(
      breakingRule(
        ['b/x.test.ts', 'apps/web/src/shared/ui/Toast.tsx', 'a/y.test.tsx', 'e2e/z.spec.ts'],
        exists,
      ),
    ).toEqual(['a/y.test.tsx', 'b/x.test.ts']);
  });

  it('the list is a sorted JSON list of paths', () => {
    expect(writeExceptions(['b', 'a'])).toBe('[\n  "a",\n  "b"\n]\n');
    expect(readExceptions('["a"]')).toEqual(['a']);
    expect(() => readExceptions('{"a": 1}')).toThrow();
  });
});

describe('the list of exceptions', () => {
  it('passes when the list is exactly the tests breaking the rule', () => {
    const r = checkTestNames(['a.test.ts'], ['a.test.ts'], ['a.test.ts', 'gone.test.ts'], 'main');
    expect(r.ok).toBe(true);
    expect(r.lines.join('\n')).toContain('1 en la lista de excepciones');
  });

  it('fails on an entry that already follows the rule or no longer exists', () => {
    const r = checkTestNames(
      ['a.test.ts'],
      ['a.test.ts', 'gone.test.ts'],
      ['a.test.ts', 'gone.test.ts'],
      'main',
    );
    expect(r.ok).toBe(false);
    expect(r.lines.join('\n')).toContain('gone.test.ts');
    expect(r.lines.join('\n')).toContain('npm run test-names:baseline');
  });

  it('fails on a test breaking the rule that is not listed', () => {
    const r = checkTestNames(['a.test.ts', 'new.test.ts'], ['a.test.ts'], ['a.test.ts'], 'main');
    expect(r.ok).toBe(false);
    expect(r.lines.join('\n')).toContain('new.test.ts');
  });

  it('a listed test that moved keeps its place; the list cannot grow over the base', () => {
    expect(checkTestNames(['moved.test.ts'], ['moved.test.ts'], ['old.test.ts'], 'main').ok).toBe(
      true,
    );
    const r = checkTestNames(
      ['a.test.ts', 'b.test.ts'],
      ['a.test.ts', 'b.test.ts'],
      ['a.test.ts'],
      'main',
    );
    expect(r.ok).toBe(false);
    expect(r.lines.join('\n')).toContain('subió de 1 a 2');
  });

  it('without a list in the base, only the listing is checked', () => {
    expect(checkTestNames(['a.test.ts'], ['a.test.ts'], null, 'main').ok).toBe(true);
  });
});
