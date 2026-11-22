// A read that does not fit its contract goes on as it came and is logged without its values.
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { z } from 'zod';
import { checked } from '../contract';

const Row = z.object({ id: z.string(), phase: z.enum(['new', 'review']) });

afterEach(() => vi.restoreAllMocks());

describe('checked', () => {
  it('gives back the same value when it fits, with its unknown keys', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const value = { id: 'a', phase: 'new', extra: 1 };
    expect(checked('db (f)', Row, value)).toBe(value);
    expect(log).not.toHaveBeenCalled();
  });

  it('logs where and what does not fit, never the values, and gives the value as it came', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const value = [{ id: 'secreto@ug.uchile.cl', phase: 'otra' }];
    expect(checked('db (f)', Row.array(), value)).toBe(value);
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/secreto|otra/);
    expect(log.mock.calls[0]).toEqual([
      'db (f): unexpected shape',
      { issues: [{ path: '0.phase', code: 'invalid_value' }], total: 1 },
    ]);
  });

  it('logs at most five issues', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    checked(
      'db (f)',
      Row.array(),
      Array.from({ length: 9 }, () => ({})),
    );
    const [, detail] = log.mock.calls[0] as [string, { issues: unknown[]; total: number }];
    expect(detail.issues).toHaveLength(5);
    expect(detail.total).toBe(18);
  });

  it('types the value with what comes in, not what parsing would give: no default is assumed', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const WithDefault = z.object({ id: z.string(), tags: z.array(z.string()).default([]) });
    expectTypeOf(checked('db (f)', WithDefault, { id: 'a' })).toEqualTypeOf<{
      id: string;
      tags?: string[] | undefined;
    }>();
  });
});
