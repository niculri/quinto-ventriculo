// Tests that a result comes as a promise and a throw comes as a rejection, never as an exception at the call.
import { describe, expect, it } from 'vitest';
import { settled } from '../settled';

describe('settled', () => {
  it('resolves with what the function gives', async () => {
    await expect(settled(() => 3)).resolves.toBe(3);
  });
  it('rejects with what the function throws, without throwing at the call', async () => {
    const failing = () => {
      throw new Error('no');
    };
    const promise = settled(failing);
    await expect(promise).rejects.toThrow('no');
  });
});
