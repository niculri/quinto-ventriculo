// Tests that settle() answers like an async function: the value at once, a throw as a rejection.
import { describe, expect, it } from 'vitest';
import { settle } from '../settle';

describe('settle', () => {
  it('resolves with the value and runs the function at once', async () => {
    let ran = false;
    const answer = settle(() => {
      ran = true;
      return 7;
    });
    expect(ran).toBe(true);
    expect(await answer).toBe(7);
  });

  it('turns a throw into a rejection instead of throwing', async () => {
    const answer = settle(() => {
      throw new Error('no');
    });
    await expect(answer).rejects.toThrow('no');
  });

  it('follows a promise that the function returns', async () => {
    expect(await settle(() => Promise.resolve('x'))).toBe('x');
  });
});
