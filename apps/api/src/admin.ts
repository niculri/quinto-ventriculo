// Who is an administrator, asked to the users' database (`is_admin()`) with the student's own session token: the
// Worker never gets the users' service key.
import type { Database } from '@qv/db-types/users';

export interface AdminChecker {
  /** Remembered `ttl` seconds: for reads. */
  isAdmin(token: string): Promise<boolean>;
  /** Never the remembered answer: for writes. `null`: it could not be asked. */
  isAdminNow?(token: string): Promise<boolean | null>;
}

export interface AdminCheckerOptions {
  supabaseUrl: string;
  publishableKey: string;
  ttl?: number;
  fetch?: typeof fetch;
  now?: () => number;
}

const MAX_REMEMBERED = 200;

export function supabaseAdminChecker(op: AdminCheckerOptions): AdminChecker {
  const base = op.supabaseUrl.replace(/\/+$/, '');
  const ttl = (op.ttl ?? 60) * 1000;
  const doFetch = op.fetch ?? fetch;
  const now = op.now ?? Date.now;
  const remembered = new Map<string, { admin: boolean; until: number }>();
  const ask = async (token: string): Promise<boolean | null> => {
    let admin: boolean;
    try {
      // By fetch, not supabase-js: each student's token, from a Worker that keeps no client per session.
      const fn: keyof Database['public']['Functions'] = 'is_admin';
      const r = await doFetch(`${base}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: {
          apikey: op.publishableKey,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: '{}',
      });
      if (!r.ok) return null;
      admin = (await r.json()) === true;
    } catch {
      return null;
    }
    if (remembered.size >= MAX_REMEMBERED) remembered.clear();
    remembered.set(token, { admin, until: now() + ttl });
    return admin;
  };
  return {
    async isAdmin(token) {
      const hit = remembered.get(token);
      if (hit && hit.until > now()) return hit.admin;
      // A failure is «no» and is not remembered.
      return (await ask(token)) ?? false;
    },
    isAdminNow: ask,
  };
}

export const noAdmins: AdminChecker = { isAdmin: async () => false };
