import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from 'jose';
import type { JWTPayload, JWTVerifyGetKey } from 'jose';
import { isAllowedEmail } from '@qv/schema';

export interface User {
  id: string;
  email: string;
}

/** Decides whether a session token is valid and whose it is. `null` = no valid session. */
export interface SessionVerifier {
  verify(token: string): Promise<User | null>;
}

export interface VerifierOptions {
  /** URL of the users Supabase project: https://<ref>.supabase.co */
  supabaseUrl: string;
  /** Public keys (JWKS). By default, the project's. Injected in tests. */
  keys?: JWTVerifyGetKey;
  /** HS256 secret of projects with legacy keys (optional). */
  hs256Secret?: string;
}

/**
 * Verifies the Supabase Auth JWT: signature, issuer, audience, expiry, role and that the email is
 * @ug.uchile.cl. This is the gate to the content: even if Google or Supabase let another account through, it
 * is rejected here.
 */
export function supabaseVerifier(op: VerifierOptions): SessionVerifier {
  const base = op.supabaseUrl.replace(/\/+$/, '');
  const issuer = `${base}/auth/v1`;
  const keys = op.keys ?? createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  const secret = op.hs256Secret ? new TextEncoder().encode(op.hs256Secret) : null;
  const options = { issuer, audience: 'authenticated', clockTolerance: 30 } as const;

  return {
    async verify(token) {
      let payload: JWTPayload;
      try {
        const { alg } = decodeProtectedHeader(token);
        if (alg === 'HS256') {
          if (!secret) return null;
          ({ payload } = await jwtVerify(token, secret, { ...options, algorithms: ['HS256'] }));
        } else {
          ({ payload } = await jwtVerify(token, keys, {
            ...options,
            algorithms: ['ES256', 'RS256'],
          }));
        }
      } catch {
        return null;
      }
      const email = typeof payload['email'] === 'string' ? payload['email'] : null;
      if (payload['role'] !== 'authenticated' || !payload.sub || !isAllowedEmail(email))
        return null;
      return { id: payload.sub, email: email!.trim().toLowerCase() };
    },
  };
}

/** «Bearer <token>» → token. */
export function tokenFromHeader(header: string | undefined | null): string | null {
  const m = header?.match(/^Bearer\s+(\S+)$/i);
  return m ? m[1]! : null;
}
