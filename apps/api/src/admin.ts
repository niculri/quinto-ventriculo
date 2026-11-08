/**
 * Who is an administrator (the preview of the draft and the release panel, step 1.7). The users' database decides it
 * (`is_admin()`, the same function the web's panel asks): the Worker asks it with the student's own session token and
 * the project's public key. It never gets the users' service key (docs/plan/areas/publicacion-y-anuncios.md, «El
 * Worker no recibe la clave de servicio de usuarios»).
 */
export interface AdminChecker {
  /** Remembered a while (`ttl`): what only reads (the preview, the panel's pages) asks this. */
  isAdmin(token: string): Promise<boolean>;
  /**
   * Asked to the database now, never the remembered answer, and remembered after (step 2.10 b): what writes asks this,
   * so that an administrator who was removed cannot publish, revert, mark or change the site a minute longer. `null`:
   * it could not be asked. Without it (a checker that remembers nothing), `isAdmin()` is used.
   */
  isAdminNow?(token: string): Promise<boolean | null>;
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
  /** The database's answer, remembered; `null` if it could not be asked (a failure is not remembered). */
  const ask = async (token: string): Promise<boolean | null> => {
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
      // A failure is «no», and the next request asks again.
      return (await ask(token)) ?? false;
    },
    isAdminNow: ask,
  };
}

/** Nobody is an administrator (a Worker without the users' public key: the preview and the panel are off). */
export const noAdmins: AdminChecker = { isAdmin: async () => false };
