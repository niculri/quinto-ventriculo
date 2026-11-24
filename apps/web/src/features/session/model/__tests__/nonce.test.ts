// Tests the nonce of Google's button: a new random value each time, and Google's copy is its SHA-256 in lowercase hex.
import { describe, expect, it } from 'vitest';
import { newNonce, sha256Hex } from '../nonce';

describe('sha256Hex', () => {
  it('is the lowercase hex Supabase Auth compares with', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('newNonce', () => {
  it('is 32 random bytes in base64url, different each time, with its hash', async () => {
    const a = await newNonce();
    const b = await newNonce();
    expect(a.raw).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.raw).not.toBe(b.raw);
    expect(a.hashed).toBe(await sha256Hex(a.raw));
  });
});
