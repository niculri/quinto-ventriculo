import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNT_DELETION_DAYS } from '@qv/schema';

/**
 * The account in the USERS database (step 2.3): accepting the terms and the privacy policy, entering (which cancels a
 * deletion asked for), downloading everything and asking to delete it. The database decides: each function only
 * knows the caller (their token) and asks for their session open.
 */

export interface AcceptedVersions {
  terms: string;
  privacy: string;
  acceptedAt: string;
}

export interface AccountState {
  /** The versions accepted last (null: never accepted). */
  accepted: AcceptedVersions | null;
  /** Entering cancelled a deletion this person had asked for. */
  deletionCancelled: boolean;
}

/** What the database refuses, by name, so that the web can say it. */
export type AccountErrorCode = 'session_closed' | 'email_mismatch' | 'admin_account' | 'unknown';

export class AccountError extends Error {
  constructor(
    readonly code: AccountErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AccountError';
  }
}

export interface AccountRepository {
  /**
   * On entering: what was accepted (`versions` if they were, if not the ones accepted last), and whether a deletion
   * was cancelled (it is cancelled here).
   */
  resume(versions: { terms: string; privacy: string }): Promise<AccountState>;
  accept(versions: { terms: string; privacy: string }): Promise<{ acceptedAt: string }>;
  /** Everything of the person, as the JSON file to save (not parsed). */
  exportData(): Promise<Blob>;
  /** Asks to delete the account; its sessions close. When it will be deleted. */
  requestDeletion(email: string): Promise<{ deleteAfter: string }>;
}

const MESSAGES: Record<AccountErrorCode, string> = {
  session_closed: 'Tu sesión se cerró. Sal y vuelve a entrar con tu cuenta @ug.uchile.cl.',
  email_mismatch: 'Ese no es el correo de tu cuenta.',
  admin_account:
    'Eres administrador del sitio: para eliminar tu cuenta, primero hay que sacarte de los administradores.',
  unknown: 'No se pudo hacer. Revisa tu conexión e intenta de nuevo.',
};

/** The database's refusal (its message is the code: …_privacy_and_account.sql) → an AccountError. */
export function accountError(e: unknown): AccountError {
  if (e instanceof AccountError) return e;
  const text = e && typeof e === 'object' && 'message' in e ? String(e.message) : '';
  const code = (['session_closed', 'email_mismatch', 'admin_account'] as const).find((c) =>
    text.includes(c),
  );
  return new AccountError(code ?? 'unknown', MESSAGES[code ?? 'unknown']);
}

interface ResumeRow {
  accepted: { terms_version: string; privacy_version: string; accepted_at: string } | null;
  deletion_cancelled: boolean;
}

export function supabaseAccountRepository(
  client: SupabaseClient,
  /** The project's URL and publishable key, for the download (it goes as it comes, not through supabase-js). */
  project: { url: string; key: string },
): AccountRepository {
  const call = async <T>(fn: string, args?: Record<string, unknown>): Promise<T> => {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw accountError(error);
    return data as T;
  };
  return {
    async resume(versions) {
      const r = await call<ResumeRow>('resume_account', {
        terms_version: versions.terms,
        privacy_version: versions.privacy,
      });
      return {
        accepted: r.accepted
          ? {
              terms: r.accepted.terms_version,
              privacy: r.accepted.privacy_version,
              acceptedAt: r.accepted.accepted_at,
            }
          : null,
        deletionCancelled: r.deletion_cancelled,
      };
    },
    async accept(versions) {
      const r = await call<{ accepted_at: string }>('accept_legal', {
        terms_version: versions.terms,
        privacy_version: versions.privacy,
      });
      return { acceptedAt: r.accepted_at };
    },
    async exportData() {
      const { data } = await client.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new AccountError('session_closed', MESSAGES.session_closed);
      let r: Response;
      try {
        r = await fetch(`${project.url.replace(/\/+$/, '')}/rest/v1/rpc/export_my_data`, {
          method: 'POST',
          headers: {
            apikey: project.key,
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: '{}',
        });
      } catch {
        throw new AccountError('unknown', MESSAGES.unknown);
      }
      if (!r.ok) throw accountError(await r.json().catch(() => null));
      return new Blob([await r.arrayBuffer()], { type: 'application/json' });
    },
    async requestDeletion(email) {
      const r = await call<{ delete_after: string }>('request_account_deletion', {
        confirm_email: email,
      });
      return { deleteAfter: r.delete_after };
    },
  };
}

/** What the demo keeps in this browser. */
interface LocalAccount {
  accepted: AcceptedVersions | null;
  deletion: { requestedAt: string; deleteAfter: string } | null;
}

/**
 * The demo and the tests, without a database: in this browser (or in memory). `email` is the demo's account;
 * `exported` is what the download brings (the demo's own data in this browser).
 */
export function localAccountRepository(
  options: {
    storage?: Storage | null;
    email?: string;
    initial?: Partial<LocalAccount>;
    exported?: () => unknown;
  } = {},
): AccountRepository {
  const storage = options.storage ?? null;
  const KEY = 'qv-demo-account';
  let memory: LocalAccount = { accepted: null, deletion: null, ...options.initial };
  const read = (): LocalAccount => {
    if (!storage) return memory;
    try {
      const saved = storage.getItem(KEY);
      return saved ? { ...memory, ...(JSON.parse(saved) as Partial<LocalAccount>) } : memory;
    } catch {
      return memory;
    }
  };
  const write = (next: LocalAccount) => {
    memory = next;
    try {
      storage?.setItem(KEY, JSON.stringify(next));
    } catch {
      // blocked storage: it stays in memory
    }
  };
  return {
    async resume() {
      const now = read();
      // Signing out came with asking: entering again is always «before the 7 days» here.
      if (now.deletion) write({ ...now, deletion: null });
      return { accepted: now.accepted, deletionCancelled: now.deletion !== null };
    },
    async accept(versions) {
      const now = read();
      const same =
        now.accepted?.terms === versions.terms && now.accepted.privacy === versions.privacy;
      const acceptedAt = same ? now.accepted!.acceptedAt : new Date().toISOString();
      write({ ...now, accepted: { ...versions, acceptedAt } });
      return { acceptedAt };
    },
    async exportData() {
      const data = {
        site: 'El Quinto Ventrículo',
        format: 1,
        exported_at: new Date().toISOString(),
        account: { email: options.email ?? null },
        tables: { legal_acceptances: read().accepted ? [read().accepted] : [] },
        ...(options.exported ? { demo: options.exported() } : {}),
      };
      return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    },
    async requestDeletion(email) {
      if (email.trim().toLowerCase() !== (options.email ?? '').toLowerCase()) {
        throw new AccountError('email_mismatch', MESSAGES.email_mismatch);
      }
      const at = new Date();
      const deleteAfter = new Date(at.getTime() + ACCOUNT_DELETION_DAYS * 86_400_000);
      write({
        ...read(),
        deletion: { requestedAt: at.toISOString(), deleteAfter: deleteAfter.toISOString() },
      });
      return { deleteAfter: deleteAfter.toISOString() };
    },
  };
}
