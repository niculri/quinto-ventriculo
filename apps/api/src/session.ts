// Verifies the Supabase Auth session token and reads the user from it.
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from 'jose';
import type { JWTPayload, JWTVerifyGetKey } from 'jose';
import { isAllowedEmail } from '@qv/schema';
import { BearerToken } from '@qv/schema/http';

export interface User {
  id: string;
  email: string;
}

export interface SessionVerifier {
  verify(token: string): Promise<User | null>;
}

export interface VerifierOptions {
  supabaseUrl: string;
  keys?: JWTVerifyGetKey;
  hs256Secret?: string;
}

/** The gate to the content: an account outside @ug.uchile.cl that Google or Supabase let through is rejected here. */
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

export function tokenFromHeader(header: string | undefined | null): string | null {
  const token = BearerToken.safeParse(header);
  return token.success ? token.data : null;
}
