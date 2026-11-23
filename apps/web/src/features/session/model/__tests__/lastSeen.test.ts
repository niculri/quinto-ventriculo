// Tests the last use of the account from the session: the later of its last sign-in and the issue of its token.
import { describe, expect, it } from 'vitest';
import { lastSeenAt } from '../lastSeen';

const SIGNED_IN = '2026-11-08T12:00:00Z';
const base64url = (json: unknown) =>
  btoa(JSON.stringify(json)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
/** A token like Supabase's, with characters that base64url writes differently from base64. */
const token = (claims: Record<string, unknown>) =>
  `${base64url({ alg: 'HS256' })}.${base64url({ x: '>>>???', ...claims })}.signature`;
const at = (iso: string) => Date.parse(iso) / 1000;

describe('lastSeenAt', () => {
  it('a token renewed after the sign-in gives its issue time', () => {
    expect(lastSeenAt(SIGNED_IN, token({ iat: at('2026-11-23T14:05:00Z') }))).toBe(
      '2026-11-23T14:05:00.000Z',
    );
    expect(lastSeenAt(null, token({ iat: at('2026-11-23T14:05:00Z') }))).toBe(
      '2026-11-23T14:05:00.000Z',
    );
  });

  it('a sign-in after the token, on another device, stays', () => {
    expect(lastSeenAt(SIGNED_IN, token({ iat: at('2026-11-01T10:00:00Z') }))).toBe(SIGNED_IN);
    expect(lastSeenAt(SIGNED_IN, token({ iat: at(SIGNED_IN) }))).toBe(SIGNED_IN);
  });

  it.each([
    ['not a JWT', 't'],
    ['without iat', token({ sub: 'u1' })],
    ['iat not a number', token({ iat: 'today' })],
    ['iat out of range', token({ iat: 1e300 })],
    ['a payload that is not base64', 'a.%%%.c'],
    ['a payload that is not JSON', `a.${btoa('{')}.c`],
  ])('a token %s leaves the sign-in', (_, t) => {
    expect(lastSeenAt(SIGNED_IN, t)).toBe(SIGNED_IN);
    expect(lastSeenAt(null, t)).toBeNull();
  });
});
