// Tests for the content version as the routes read it: kept for its time, one read at a time, forgotten at once.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveDependencies } from '../../dependencies';
import type { AppOptions } from '../../dependencies';
import { contentVersionReader } from '../contentVersion';
import { MediaSigner } from '../mediaSigner';

const base = {
  verifier: { verify: () => Promise.resolve(null) },
  repository: {} as AppOptions['repository'],
  media: { get: () => Promise.resolve(null) },
  signer: new MediaSigner('s'.repeat(32)),
};

const reader = (options: Partial<AppOptions>) =>
  contentVersionReader(resolveDependencies({ ...base, ...options }));

afterEach(() => vi.useRealTimers());

describe('contentVersionReader', () => {
  it('without a source it is null, and nothing is asked', async () => {
    expect(await reader({}).read()).toBeNull();
  });

  it('keeps what it read for its time, and asks again after it', async () => {
    vi.useFakeTimers();
    const current = vi.fn().mockResolvedValueOnce('a').mockResolvedValueOnce('b');
    const r = reader({ contentVersion: { current }, contentVersionTtl: 1000 });
    expect(await r.read()).toBe('a');
    vi.advanceTimersByTime(999);
    expect(await r.read()).toBe('a');
    vi.advanceTimersByTime(2);
    expect(await r.read()).toBe('b');
    expect(current).toHaveBeenCalledTimes(2);
  });

  it('a slow read is kept for its time counted from when it started, not from when it answered', async () => {
    vi.useFakeTimers();
    let answer: (v: string) => void = () => undefined;
    const current = vi
      .fn<() => Promise<string>>()
      .mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
      .mockResolvedValue('nueva');
    const r = reader({ contentVersion: { current }, contentVersionTtl: 1000 });
    const slow = r.read();
    vi.advanceTimersByTime(800);
    answer('vieja');
    expect(await slow).toBe('vieja');
    vi.advanceTimersByTime(199);
    expect(await r.read()).toBe('vieja');
    vi.advanceTimersByTime(2);
    expect(await r.read()).toBe('nueva');
  });

  it('requests that arrive together share one read', async () => {
    const current = vi.fn(() => Promise.resolve('a'));
    const r = reader({ contentVersion: { current } });
    expect(await Promise.all([r.read(), r.read(), r.read()])).toEqual(['a', 'a', 'a']);
    expect(current).toHaveBeenCalledTimes(1);
  });

  it('a read that started before forgetting does not keep what it brings', async () => {
    let answer: (v: string) => void = () => undefined;
    const current = vi
      .fn<() => Promise<string>>()
      .mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
      .mockResolvedValue('nueva');
    const r = reader({ contentVersion: { current } });
    const before = r.read();
    r.forget();
    const after = r.read();
    answer('vieja');
    expect(await before).toBe('vieja');
    expect(await after).toBe('nueva');
    expect(await r.read()).toBe('nueva');
    expect(current).toHaveBeenCalledTimes(2);
  });

  it('a failure is null and is not kept', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const current = vi.fn().mockRejectedValueOnce(new Error('caída')).mockResolvedValueOnce('a');
    const r = reader({ contentVersion: { current } });
    expect(await r.read()).toBeNull();
    expect(await r.read()).toBe('a');
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});
