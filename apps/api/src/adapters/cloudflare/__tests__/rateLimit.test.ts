// Tests for the Workers rate limiting binding as a limiter, and that wrangler.jsonc declares both with the window the
// 429 tells to wait.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { RATE_LIMIT_PERIOD } from '../../../ports/rateLimit';
import { bindingRateLimiter } from '../rateLimit';

describe('bindingRateLimiter', () => {
  it('asks the binding with the key and says what it decided', async () => {
    const limit = vi.fn(async ({ key }: { key: string }) => ({ success: key !== 'agotado' }));
    const limiter = bindingRateLimiter({ limit });
    expect(await limiter.allow('ana')).toBe(true);
    expect(await limiter.allow('agotado')).toBe(false);
    expect(limit.mock.calls.map(([o]) => o)).toEqual([{ key: 'ana' }, { key: 'agotado' }]);
  });

  it('lets the request through when the binding fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const limiter = bindingRateLimiter({
      limit: () => Promise.reject(new Error('no disponible')),
    });
    expect(await limiter.allow('ana')).toBe(true);
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});

describe('wrangler.jsonc', () => {
  it('declares the two limits with the window of RATE_LIMIT_PERIOD and namespaces of their own', () => {
    const text = readFileSync(new URL('../../../../wrangler.jsonc', import.meta.url), 'utf8')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/,(\s*[}\]])/g, '$1');
    const config = JSON.parse(text) as {
      ratelimits: {
        name: string;
        namespace_id: string;
        simple: { limit: number; period: number };
      }[];
    };
    expect(config.ratelimits.map((r) => r.name).sort()).toEqual([
      'ADDRESS_RATE_LIMIT',
      'STUDENT_RATE_LIMIT',
    ]);
    expect(new Set(config.ratelimits.map((r) => r.namespace_id)).size).toBe(2);
    for (const r of config.ratelimits) expect(r.simple.period).toBe(RATE_LIMIT_PERIOD);
  });
});
