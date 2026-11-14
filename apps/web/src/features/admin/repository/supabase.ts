// Administrators and invitations in the users database. The database decides who is an administrator and what each
// one can read (RLS and `is_admin()`); the web only uses the answer to show the panel.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@qv/db-types/users';
import { fromJson, toJson } from '../../../lib/json';
import type { AdminRepository } from './port';
import { AccessError, MAX_EMAILS } from './model';
import type { AccessReport, InviteRejection, SetAdminResult } from './model';

interface AccessReportRow {
  open_to_domain: boolean;
  lists: { list: string; invited: number; with_account: number }[];
  invited: {
    email: string;
    list: string;
    note: string | null;
    invited_by: string | null;
    invited_at: string;
    admin: boolean;
    has_account: boolean;
    last_sign_in_at: string | null;
  }[];
  accounts_without_invite: { email: string; created_at: string; last_sign_in_at: string | null }[];
  /** Absent from a database without the site owner column. */
  owner?: string | null;
  you_are_owner?: boolean;
}

const accessReportOf = (r: AccessReportRow): AccessReport => ({
  openToDomain: r.open_to_domain,
  lists: r.lists.map((l) => ({ list: l.list, invited: l.invited, withAccount: l.with_account })),
  invited: r.invited.map((i) => ({
    email: i.email,
    list: i.list,
    note: i.note,
    invitedBy: i.invited_by,
    invitedAt: i.invited_at,
    admin: i.admin,
    hasAccount: i.has_account,
    lastSignInAt: i.last_sign_in_at,
  })),
  accountsWithoutInvite: r.accounts_without_invite.map((a) => ({
    email: a.email,
    createdAt: a.created_at,
    lastSignInAt: a.last_sign_in_at,
  })),
  owner: r.owner ?? null,
  youAreOwner: r.you_are_owner === true,
});

function accessError(error: { code?: string; message: string }): AccessError {
  if (error.code === '28000' || /session_closed/.test(error.message)) {
    return new AccessError('Tu sesión se cerró. Sal y vuelve a entrar.');
  }
  // Before the codes: these refusals share 42501 and P0002 with the others.
  if (/owner_only/.test(error.message)) {
    return new AccessError('Solo el dueño del sitio nombra o quita administradores.');
  }
  if (/owner_stays/.test(error.message)) {
    return new AccessError('Al dueño del sitio no se le quita.');
  }
  if (/not_invited/.test(error.message)) {
    return new AccessError('Primero tiene que estar invitado. Recarga la página.');
  }
  if (error.code === '42501') return new AccessError('Solo para administradores.');
  if (error.code === 'P0002') return new AccessError('Esa lista ya no existe. Recarga la página.');
  if (/at most 500/.test(error.message)) {
    return new AccessError(`A lo más ${MAX_EMAILS} correos por vez.`);
  }
  // By the message of each refusal, not by any that names the key («expected { "emails": [...], "list": … }» also does).
  if (/"list" is required/.test(error.message)) {
    return new AccessError('El nombre de la lista tiene que tener entre 1 y 60 letras.');
  }
  if (/"note" has at most/.test(error.message)) {
    return new AccessError('La nota tiene a lo más 200 letras.');
  }
  return new AccessError('No se pudo. Revisa tu conexión e intenta de nuevo.');
}

export function supabaseAdminRepository(client: SupabaseClient<Database>): AdminRepository {
  return {
    async isAdmin() {
      const { data, error } = await client.rpc('is_admin');
      if (error) throw error;
      return data === true;
    },
    async deckImpact(deckIds) {
      const { data, error } = await client.rpc('admin_deck_impact', { deck_ids: [...deckIds] });
      if (error) throw error;
      return data.map((r) => ({
        deckId: r.deck_id,
        studentsSeen: r.students_seen,
        cardsSeen: r.cards_seen,
        studentsActive: r.students_active,
      }));
    },
    async accessReport() {
      const { data, error } = await client.rpc('admin_access_report');
      if (error) throw accessError(error);
      return accessReportOf(fromJson<AccessReportRow>(data));
    },
    async invite({ emails, list, note }) {
      const { data, error } = await client.rpc('admin_invite_emails', {
        p: toJson({ emails, list, ...(note ? { note } : {}) }),
      });
      if (error) throw accessError(error);
      const r = fromJson<{
        added_emails: string[];
        already_emails: string[];
        rejected: { email: string; reason: InviteRejection }[];
      }>(data);
      return { added: r.added_emails, already: r.already_emails, rejected: r.rejected };
    },
    async removeInvites(target) {
      const { data, error } = await client.rpc('admin_remove_invites', { p: toJson(target) });
      if (error) throw accessError(error);
      const r = fromJson<{
        removed: string[];
        not_invited: string[];
        kept_admins: string[];
        sessions_closed: number;
        open_to_domain: boolean;
      }>(data);
      return {
        removed: r.removed,
        notInvited: r.not_invited,
        keptAdmins: r.kept_admins,
        sessionsClosed: r.sessions_closed,
        openToDomain: r.open_to_domain,
      };
    },
    async setAdmin({ email, admin }) {
      const { data, error } = await client.rpc('admin_set_admin', { p: { email, admin } });
      if (error) throw accessError(error);
      return fromJson<SetAdminResult>(data);
    },
  };
}
