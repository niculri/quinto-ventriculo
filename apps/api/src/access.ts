import { decodeJwt } from 'jose';
import { LEGAL_VERSIONS } from '@qv/schema';

/**
 * Whether a session still has access (step 2.1). The JWT says who the student is and that it is @ug.uchile.cl, but
 * not whether they are still invited: a token stays valid up to an hour after removing someone, closing their sessions
 * or deleting their account. The users' database decides it (`access_status()`: invited, or the domain open, and the
 * session of the token still open), asked with the student's own token and the project's public key, as `is_admin()`
 * (admin.ts): the Worker never gets the users' service key.
 *
 * - `allowed` / `denied` / `signed_out`: what the database said, remembered `ttl` seconds per token (default 30). That
 *   is the most a removed student keeps reading after `remove_invites()`. `signed_out`: still invited, but the session
 *   of the token is closed (signed out on another device, which closes them all; the account deleted).
 * - `not_accepted` (step 2.3): invited and with the session open, but without accepting the versions of the terms and
 *   of the privacy policy this Worker was deployed with (`LEGAL_VERSIONS`). **Never remembered**: once the person
 *   accepts, the next request asks again and gets the material at once (not 30 s later, and in every isolate).
 * - `expired`: the database no longer takes the token (it expired in the 30 s of tolerance of the verifier): a 401,
 *   as without a session, so that the web gets a new one.
 * - `unknown`: it could not be asked (network, the database down, a wrong key, an answer it does not know). Never
 *   remembered: the next request asks again.
 */
export type Access = 'allowed' | 'denied' | 'signed_out' | 'not_accepted' | 'expired' | 'unknown';

export interface AccessChecker {
  check(token: string): Promise<Access>;
}

export interface AccessCheckerOptions {
  /** URL of the users Supabase project. */
  supabaseUrl: string;
  /** Its publishable (anon) key: it only identifies the project; what decides is the student's token. */
  publishableKey: string;
  /** Seconds an answer is remembered (default 30). */
  ttl?: number;
  /** The versions a person has to have accepted (default `LEGAL_VERSIONS` of @qv/schema). */
  legal?: { terms: string; privacy: string };
  /** Injected in tests. */
  fetch?: typeof fetch;
  now?: () => number;
}

/** Default seconds an answer is remembered: the longest a removed student keeps reading. */
export const ACCESS_TTL = 30;
const MAX_REMEMBERED = 500;
/** What `access_status()` answers → what the Worker does. Anything else is `unknown` (fails closed). */
const ANSWERS: Record<string, 'allowed' | 'denied' | 'signed_out' | 'not_accepted'> = {
  allowed: 'allowed',
  not_invited: 'denied',
  signed_out: 'signed_out',
  not_accepted: 'not_accepted',
};
/**
 * A 401 of the database means «expired» only for a token that expired or is about to (a minute: the clocks of the
 * Worker and of Supabase are not the same). Any other 401 (a wrong or revoked publishable key) is the Worker's
 * problem, not the student's: `unknown`, a 503 and a line in the log, not «sign in again» for everybody.
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
  });
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
        const r = await doFetch(`${base}/rest/v1/rpc/access_status`, {
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

/** A Worker without the users' public key cannot ask: nothing of the material is served (it fails closed). */
export const accessUnavailable: AccessChecker = {
  check: async () => {
    console.error('USERS_SUPABASE_PUBLISHABLE_KEY is missing: no session can be checked');
    return 'unknown';
  },
};
