// The last use of the account as the session knows it: its last sign-in or the last renewal of its token.
import { z } from 'zod';

const Claims = z.object({ iat: z.number() });

/** When the token was issued, as an ISO date; null if it is not a JWT with `iat`. */
function issuedAt(token: string): string | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const claims = Claims.safeParse(
      JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))),
    );
    return claims.success ? new Date(claims.data.iat * 1000).toISOString() : null;
  } catch {
    return null;
  }
}

/**
 * Supabase Auth moves `last_sign_in_at` only when someone signs in with Google, and issues a new token every time the
 * session renews itself, so the later of the two is the last use, as the access report gives it.
 */
export function lastSeenAt(lastSignInAt: string | null, token: string): string | null {
  const issued = issuedAt(token);
  if (issued === null) return lastSignInAt;
  if (lastSignInAt !== null && Date.parse(lastSignInAt) >= Date.parse(issued)) return lastSignInAt;
  return issued;
}
