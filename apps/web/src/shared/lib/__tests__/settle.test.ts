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

  it('is settled when it is returned, a value and a throw alike, as an async function without await is', async () => {
    const seen = async (answer: Promise<unknown>) => {
      const log: string[] = [];
      answer.then(
        () => log.push('value'),
        () => log.push('rejection'),
      );
      await Promise.resolve();
      return log;
    };
    expect(await seen(settle(() => 1))).toEqual(['value']);
    expect(
      await seen(
        settle(() => {
          throw new Error('no');
        }),
      ),
    ).toEqual(['rejection']);
    expect(await seen((async () => 1)())).toEqual(['value']);
  });
});
