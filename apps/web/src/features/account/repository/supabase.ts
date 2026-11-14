// The account in the users database: accepting the terms, entering (which cancels a requested deletion), downloading
// the data and asking to delete it. The database decides, from the caller's token and open session.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AccountRepository } from './port';
import { AccountError, MESSAGES } from './model';

/** The database's refusal carries the code as its message. */
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
  /** The download goes by fetch, so the file is saved as it comes, not parsed by supabase-js. */
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
