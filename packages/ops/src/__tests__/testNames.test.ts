// Tests the test names rule: what follows it and what the check reports.
import { describe, expect, it } from 'vitest';
import { breakingRule, checkTestNames, followsRule } from '../testNames';

const tree = new Set([
  'apps/web/src/shared/ui/Toast.tsx',
  'apps/web/src/shared/lib/storage.ts',
  'packages/eslint-plugin/src/fileHeader.js',
]);
const exists = (p: string) => tree.has(p);

describe('the test names rule', () => {
  it('a test in __tests__ named after a file of the folder above follows it', () => {
    expect(followsRule('apps/web/src/shared/ui/__tests__/Toast.test.tsx', exists)).toBe(true);
    expect(followsRule('apps/web/src/shared/lib/__tests__/storage.test.ts', exists)).toBe(true);
    expect(followsRule('packages/eslint-plugin/src/__tests__/fileHeader.test.ts', exists)).toBe(
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
      followsRule(
        'apps/web/src/features/x/api/repository/__tests__/memory.contract.test.ts',
        exists,
      ),
    ).toBe(true);
    expect(followsRule('apps/web/src/features/x/__tests__/review.flow.test.ts', exists)).toBe(true);
    expect(
      followsRule('apps/web/src/features/x/api/repository/memory.contract.test.ts', exists),
    ).toBe(false);
  });

  it('only tests count, sorted', () => {
    expect(
      breakingRule(
        ['b/x.test.ts', 'apps/web/src/shared/ui/Toast.tsx', 'a/y.test.tsx', 'e2e/z.spec.ts'],
        exists,
      ),
    ).toEqual(['a/y.test.tsx', 'b/x.test.ts']);
  });
});

describe('the result', () => {
  it('passes when every test follows the rule', () => {
    expect(checkTestNames([]).ok).toBe(true);
  });

  it('lists the tests that break it and says how to name them', () => {
    const r = checkTestNames(['a.test.ts']);
    expect(r.ok).toBe(false);
    expect(r.lines.join('\n')).toContain('a.test.ts');
    expect(r.lines.join('\n')).toContain('__tests__/<nombre>.contract.test.ts(x)');
  });
});
