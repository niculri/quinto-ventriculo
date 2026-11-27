// The users' database summary of «Tarjetas» (`admin_card_quality()`), asked with the administrator's own token.
import type { Database } from '@qv/db-types/users';
import type { CardQualitySource } from '../../ports/cardQuality';

type Functions = Database['public']['Functions'];

/** PostgREST's answer when the function does not exist: the migration is not applied yet. */
const MISSING_FUNCTION = 'PGRST202';

export function supabaseCardQuality(op: {
  supabaseUrl: string;
  publishableKey: string;
  fetch?: typeof fetch;
}): CardQualitySource {
  const base = op.supabaseUrl.replace(/\/+$/, '');
  const doFetch = op.fetch ?? fetch;
  return {
    async read(token, scope) {
      // By fetch, not supabase-js: the administrator's own token, from a Worker that keeps no client per session.
      const fn: keyof Functions = 'admin_card_quality';
      const r = await doFetch(`${base}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: {
          apikey: op.publishableKey,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ p: scope } satisfies Functions['admin_card_quality']['Args']),
      });
      if (r.status === 404) {
        const body: unknown = await r.json().catch(() => null);
        if (body && typeof body === 'object' && 'code' in body && body.code === MISSING_FUNCTION) {
          return null;
        }
      }
      if (!r.ok) throw new Error(`admin_card_quality: ${r.status}`);
      return r.json();
    },
  };
}
