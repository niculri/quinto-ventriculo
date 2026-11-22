// Tests the command file of `npm run unpublish`: how it ends when the run fails or does not.
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('the command file', () => {
  afterEach(() => {
    process.exitCode = undefined;
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock('../runUnpublish');
  });

  const enter = async (result: () => Promise<void>) => {
    vi.doMock('../runUnpublish', () => ({ runUnpublish: result }));
    const errors: unknown[] = [];
    vi.spyOn(console, 'error').mockImplementation((e: unknown) => void errors.push(e));
    await import('../unpublish');
    await new Promise((r) => setImmediate(r));
    return errors;
  };

  it('a run that ends well prints nothing and leaves the exit code alone', async () => {
    expect(await enter(() => Promise.resolve())).toEqual([]);
    expect(process.exitCode).toBeUndefined();
  });

  it('an error is printed as its message, and the exit code is 1', async () => {
    expect(await enter(() => Promise.reject(new Error('algo falló')))).toEqual(['algo falló']);
    expect(process.exitCode).toBe(1);
  });

  it('what is thrown that is not an error is printed as it is', async () => {
    expect(
      await enter(async () => {
        throw 'un texto' as unknown as Error;
      }),
    ).toEqual(['un texto']);
    expect(process.exitCode).toBe(1);
  });
});
