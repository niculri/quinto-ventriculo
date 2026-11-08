/**
 * Who is an administrator (the preview of the draft and the release panel, step 1.7). The users' database decides it
 * (`is_admin()`, the same function the web's panel asks): the Worker asks it with the student's own session token and
 * the project's public key. It never gets the users' service key (docs/plan/areas/publicacion-y-anuncios.md, «El
 * Worker no recibe la clave de servicio de usuarios»).
 */
export interface AdminChecker {
  isAdmin(token: string): Promise<boolean>;
}

export interface AdminCheckerOptions {
  /** URL of the users Supabase project. */
  supabaseUrl: string;
  /** Its publishable (anon) key: it only identifies the project; what decides is the student's token. */
  publishableKey: string;
  /** Seconds an answer is remembered (default 60): a preview reads several things a page. */
  ttl?: number;
  /** Injected in tests. */
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
  return {
    async isAdmin(token) {
      const hit = remembered.get(token);
      if (hit && hit.until > now()) return hit.admin;
      let admin: boolean;
      try {
        const r = await doFetch(`${base}/rest/v1/rpc/is_admin`, {
          method: 'POST',
          headers: {
            apikey: op.publishableKey,
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: '{}',
        });
        // A failure is not remembered: the next request asks again.
        if (!r.ok) return false;
        admin = (await r.json()) === true;
      } catch {
        return false;
      }
      if (remembered.size >= MAX_REMEMBERED) remembered.clear();
      remembered.set(token, { admin, until: now() + ttl });
      return admin;
    },
  };
}

/** Nobody is an administrator (a Worker without the users' public key: the preview and the panel are off). */
export const noAdmins: AdminChecker = { isAdmin: async () => false };
