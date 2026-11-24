// The users' and the content databases' health checks, by fetch: they need the abort signal and the status alone.
import type { Database as ContentDatabase } from '@qv/db-types/content';
import type { Database as UsersDatabase } from '@qv/db-types/users';
import type { HealthCheck } from '../../ports/health';

type Fetch = typeof fetch;

/** A users' RPC without arguments, asked with the project's public key; it gives back what the function answered. */
async function usersRpc(
  supabaseUrl: string,
  publishableKey: string | undefined,
  fn: keyof UsersDatabase['public']['Functions'],
  signal: AbortSignal,
  doFetch: Fetch,
): Promise<unknown> {
  if (!publishableKey) throw new Error('USERS_SUPABASE_PUBLISHABLE_KEY is missing');
  // By fetch, not supabase-js: it needs the abort signal and the status alone, and no client for one call.
  const r = await doFetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: '{}',
    signal,
  });
  if (!r.ok) throw new Error(`users ${fn}(): ${r.status}`);
  return r.json();
}

export function usersDatabaseCheck(
  supabaseUrl: string,
  publishableKey: string | undefined,
  doFetch: Fetch = fetch,
): HealthCheck {
  return async (signal) => {
    const answer = await usersRpc(supabaseUrl, publishableKey, 'health', signal, doFetch);
    if (answer !== true) throw new Error('users health(): unexpected answer');
  };
}

/** Fails once the users' database passes 60 % of the free plan's 500 MB, with time to act before it fills. */
export function usersStorageCheck(
  supabaseUrl: string,
  publishableKey: string | undefined,
  doFetch: Fetch = fetch,
): HealthCheck {
  return async (signal) => {
    const answer = await usersRpc(supabaseUrl, publishableKey, 'storage_health', signal, doFetch);
    if (answer === false) throw new Error('users database over 60 % of its 500 MB');
    if (answer !== true) throw new Error('users storage_health(): unexpected answer');
  };
}

export function authCheck(
  supabaseUrl: string,
  publishableKey: string | undefined,
  doFetch: Fetch = fetch,
): HealthCheck {
  return async (signal) => {
    if (!publishableKey) throw new Error('USERS_SUPABASE_PUBLISHABLE_KEY is missing');
    const r = await doFetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/health`, {
      headers: { apikey: publishableKey },
      signal,
    });
    await r.body?.cancel();
    if (!r.ok) throw new Error(`auth health: ${r.status}`);
  };
}

export function contentDatabaseCheck(
  supabaseUrl: string,
  serviceKey: string,
  doFetch: Fetch = fetch,
): HealthCheck {
  return async (signal) => {
    // By fetch, as the users' check: the abort signal and the status alone, without reading the body.
    const fn: keyof ContentDatabase['public']['Functions'] = 'site_settings';
    const r = await doFetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: '{}',
      signal,
    });
    await r.body?.cancel();
    if (!r.ok) throw new Error(`content site_settings(): ${r.status}`);
  };
}
