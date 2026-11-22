// Tests for whether an image is on the site: a key that cannot be one is not asked about, and `has` is cheaper than `get`.
import { describe, expect, it } from 'vitest';
import type { MediaStore } from '../../ports/media';
import { isOnSite } from '../mediaPresence';

const KEY = `tests/${'a'.repeat(32)}.webp`;

describe('isOnSite', () => {
  it('a key that does not have the shape of one is false without asking the store', async () => {
    let asked = 0;
    const store: MediaStore = {
      get: async () => (asked++, null),
      has: async () => (asked++, true),
    };
    expect(await isOnSite(store, '../secreto')).toBe(false);
    expect(asked).toBe(0);
  });

  it('uses has when the store has it, and reads the object only when it does not', async () => {
    const calls: string[] = [];
    const withHas: MediaStore = {
      get: async () => (calls.push('get'), null),
      has: async () => (calls.push('has'), true),
    };
    expect(await isOnSite(withHas, KEY)).toBe(true);
    const withoutHas: MediaStore = {
      get: async () => (calls.push('get'), { body: new Uint8Array(), contentType: 'x' }),
    };
    expect(await isOnSite(withoutHas, KEY)).toBe(true);
    expect(await isOnSite({ get: async () => null }, KEY)).toBe(false);
    expect(calls).toEqual(['has', 'get']);
  });
});
