// The users' database figures of «Uso» (`admin_usage()`), asked with the administrator's own token.
import type { Database } from '@qv/db-types/users';
import type { UsageStatsSource } from '../../ports/usage';

type Functions = Database['public']['Functions'];

export function supabaseUsageStats(op: {
  supabaseUrl: string;
  publishableKey: string;
  fetch?: typeof fetch;
}): UsageStatsSource {
  const base = op.supabaseUrl.replace(/\/+$/, '');
  const doFetch = op.fetch ?? fetch;
  return {
    async stats(token, groups) {
      // By fetch, not supabase-js: the administrator's own token, from a Worker that keeps no client per session.
      const fn: keyof Functions = 'admin_usage';
      const r = await doFetch(`${base}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: {
          apikey: op.publishableKey,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ p: groups } satisfies Functions['admin_usage']['Args']),
      });
      if (!r.ok) throw new Error(`admin_usage: ${r.status}`);
      return r.json();
    },
  };
}
