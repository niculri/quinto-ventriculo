// Whether a session is still invited, asked to the users' database (`access_status()`) with the student's own token.
// A JWT stays valid up to an hour after a removal, so it is not enough; the Worker never holds a service key.
import { decodeJwt } from 'jose';
import type { Database } from '@qv/db-types/users';
import { LEGAL_VERSIONS } from '@qv/schema';
import type { AccessChecker } from '../../ports/access';

export interface AccessCheckerOptions {
  supabaseUrl: string;
  publishableKey: string;
  ttl?: number;
  legal?: { terms: string; privacy: string };
  fetch?: typeof fetch;
  now?: () => number;
}

type Functions = Database['public']['Functions'];

export const ACCESS_TTL = 30;
const MAX_REMEMBERED = 500;
/** Any other answer is `unknown`: it fails closed. */
const ANSWERS: Record<string, 'allowed' | 'denied' | 'signed_out' | 'not_accepted'> = {
  allowed: 'allowed',
  not_invited: 'denied',
  signed_out: 'signed_out',
  not_accepted: 'not_accepted',
};
/**
 * A 401 means «expired» only near the token's expiry (the clocks differ); any other 401 is a bad publishable key, so
 * `unknown` and a 503 rather than «sign in again» for everybody.
 */
const EXPIRY_MARGIN_MS = 60_000;

function expiresAt(token: string): number {
  try {
    const exp = decodeJwt(token).exp;
    return typeof exp === 'number' ? exp * 1000 : 0;
  } catch {
    return 0;
  }
}

export function supabaseAccessChecker(op: AccessCheckerOptions): AccessChecker {
  const base = op.supabaseUrl.replace(/\/+$/, '');
  const ttl = (op.ttl ?? ACCESS_TTL) * 1000;
  const doFetch = op.fetch ?? fetch;
  const now = op.now ?? Date.now;
  const body = JSON.stringify({
    terms_version: op.legal?.terms ?? LEGAL_VERSIONS.terms.version,
    privacy_version: op.legal?.privacy ?? LEGAL_VERSIONS.privacy.version,
  } satisfies Functions['access_status']['Args']);
  const remembered = new Map<
    string,
    { access: 'allowed' | 'denied' | 'signed_out'; until: number }
  >();
  return {
    async check(token) {
      const hit = remembered.get(token);
      if (hit && hit.until > now()) return hit.access;
      let access: 'allowed' | 'denied' | 'signed_out' | 'not_accepted' | undefined;
      try {
        // By fetch, not supabase-js: each student's token, and its HTTP status, which says why it failed.
        const fn: keyof Functions = 'access_status';
        const r = await doFetch(`${base}/rest/v1/rpc/${fn}`, {
          method: 'POST',
          headers: {
            apikey: op.publishableKey,
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body,
        });
        if (r.status === 401) {
          if (expiresAt(token) <= now() + EXPIRY_MARGIN_MS) return 'expired';
          console.error(
            'access_status: 401 with a token that has not expired (the publishable key?)',
          );
          return 'unknown';
        }
        if (!r.ok) {
          console.error(`access_status: ${r.status}`);
          return 'unknown';
        }
        const answer: unknown = await r.json();
        access =
          typeof answer === 'string' && Object.hasOwn(ANSWERS, answer)
            ? ANSWERS[answer]
            : undefined;
        if (!access) {
          console.error(`access_status: unexpected answer ${JSON.stringify(answer)?.slice(0, 60)}`);
          return 'unknown';
        }
      } catch (e) {
        console.error(e);
        return 'unknown';
      }
      if (access === 'not_accepted') return access;
      if (remembered.size >= MAX_REMEMBERED) remembered.clear();
      remembered.set(token, { access, until: now() + ttl });
      return access;
    },
  };
}
