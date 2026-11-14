// The account in the users database: accepting the terms, entering (which cancels a requested deletion), downloading
// the data and asking to delete it. The database decides, from the caller's token and open session.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@qv/db-types/users';
import { databaseError } from '@qv/schema/database';
import { ACCOUNT_RPC } from '@qv/schema/user';
import { fromDatabase } from '../../../lib/json';
import type { AccountRepository } from './port';
import { AccountError, MESSAGES } from './model';

/** The database's refusal carries the code as its message. */
export function accountError(e: unknown): AccountError {
  if (e instanceof AccountError) return e;
  const error = databaseError({
    message: e && typeof e === 'object' && 'message' in e ? String(e.message) : '',
  });
  const code = (['session_closed', 'email_mismatch', 'admin_account'] as const).find((c) =>
    error.says(c),
  );
  return new AccountError(code ?? 'unknown', MESSAGES[code ?? 'unknown']);
}

type Functions = Database['public']['Functions'];

export function supabaseAccountRepository(
  client: SupabaseClient<Database>,
  /** The download goes by fetch, so the file is saved as it comes, not parsed by supabase-js. */
  project: { url: string; key: string },
): AccountRepository {
  const call = async <F extends keyof Functions>(fn: F, args?: Functions[F]['Args']) => {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw accountError(error);
    return data;
  };
  return {
    async resume(versions) {
      const r = fromDatabase(
        'resume_account',
        ACCOUNT_RPC.resume_account.returns,
        await call('resume_account', {
          terms_version: versions.terms,
          privacy_version: versions.privacy,
        }),
      );
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
      const r = fromDatabase(
        'accept_legal',
        ACCOUNT_RPC.accept_legal.returns,
        await call('accept_legal', {
          terms_version: versions.terms,
          privacy_version: versions.privacy,
        }),
      );
      return { acceptedAt: r.accepted_at };
    },
    async exportData() {
      const { data } = await client.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new AccountError('session_closed', MESSAGES.session_closed);
      let r: Response;
      try {
        const fn: keyof Functions = 'export_my_data';
        r = await fetch(`${project.url.replace(/\/+$/, '')}/rest/v1/rpc/${fn}`, {
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
      const r = fromDatabase(
        'request_account_deletion',
        ACCOUNT_RPC.request_account_deletion.returns,
        await call('request_account_deletion', { confirm_email: email }),
      );
      return { deleteAfter: r.delete_after };
    },
  };
}
