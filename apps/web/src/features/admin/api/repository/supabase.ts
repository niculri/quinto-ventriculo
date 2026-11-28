// Administrators and invitations in the users database. The database decides who is an administrator and what each
// one can read (RLS and `is_admin()`); the web only uses the answer to show the panel.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@qv/db-types/users';
import { databaseError } from '@qv/schema/database';
import type { DbErrorLike } from '@qv/schema/database';
import { ACCESS_RPC } from '@qv/schema/user';
import type { AccessReportRow } from '@qv/schema/user';
import { fromDatabase } from '../../../../shared/lib/json';
import type { AdminRepository } from './port';
import { AccessError, MAX_EMAILS } from './model';
import type { AccessReport } from './model';

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
    lastSeenAt: i.last_seen_at ?? i.last_sign_in_at,
  })),
  accountsWithoutInvite: r.accounts_without_invite.map((a) => ({
    email: a.email,
    createdAt: a.created_at,
    lastSeenAt: a.last_seen_at ?? a.last_sign_in_at,
  })),
  owner: r.owner ?? null,
  youAreOwner: r.you_are_owner === true,
});

function accessError(raw: DbErrorLike): AccessError {
  const error = databaseError(raw);
  if (error.hasCode('28000') || error.says('session_closed')) {
    return new AccessError('Tu sesión se cerró. Sal y vuelve a entrar.');
  }
  // Before the codes: these refusals share 42501 and P0002 with the others.
  if (error.says('owner_only')) {
    return new AccessError('Solo el dueño del sitio nombra o quita administradores.');
  }
  if (error.says('owner_stays')) {
    return new AccessError('Al dueño del sitio no se le quita.');
  }
  if (error.says('not_invited')) {
    return new AccessError('Primero tiene que estar invitado. Recarga la página.');
  }
  if (error.hasCode('42501')) return new AccessError('Solo para administradores.');
  if (error.hasCode('P0002')) return new AccessError('Esa lista ya no existe. Recarga la página.');
  if (error.says('too_many_emails')) {
    return new AccessError(`A lo más ${MAX_EMAILS} correos por vez.`);
  }
  // By the message of each refusal, not by any that names the key («expected { "emails": [...], "list": … }» also does).
  if (error.says('list_required')) {
    return new AccessError('El nombre de la lista tiene que tener entre 1 y 60 letras.');
  }
  if (error.says('note_too_long')) {
    return new AccessError('La nota tiene a lo más 200 letras.');
  }
  return new AccessError('No se pudo. Revisa tu conexión e intenta de nuevo.');
}

export function supabaseAdminRepository(client: SupabaseClient<Database>): AdminRepository {
  return {
    async isAdmin() {
      const { data, error } = await client.rpc('is_admin');
      if (error) throw error;
      return data;
    },
    async accountLabels(ids) {
      const { data, error } = await client.rpc('admin_account_labels', { ids: [...ids] });
      if (error) throw error;
      return data.map((r) => ({ id: r.id, email: r.email, name: r.name }));
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
      return accessReportOf(
        fromDatabase('admin_access_report', ACCESS_RPC.admin_access_report.returns, data),
      );
    },
    async invite({ emails, list, note }) {
      const { data, error } = await client.rpc('admin_invite_emails', {
        p: { emails, list, ...(note ? { note } : {}) },
      });
      if (error) throw accessError(error);
      const r = fromDatabase('admin_invite_emails', ACCESS_RPC.admin_invite_emails.returns, data);
      return { added: r.added_emails, already: r.already_emails, rejected: r.rejected };
    },
    async removeInvites(target) {
      const { data, error } = await client.rpc('admin_remove_invites', { p: target });
      if (error) throw accessError(error);
      const r = fromDatabase('admin_remove_invites', ACCESS_RPC.admin_remove_invites.returns, data);
      return {
        removed: r.removed,
        notInvited: r.not_invited,
        keptAdmins: r.kept_admins,
        sessionsClosed: r.sessions_closed,
        openToDomain: r.open_to_domain,
      };
    },
    async moveInvites(moves) {
      const { data, error } = await client.rpc('admin_move_invites', { p: { moves } });
      if (error) throw accessError(error);
      const r = fromDatabase('admin_move_invites', ACCESS_RPC.admin_move_invites.returns, data);
      return { moved: r.moved, already: r.already, notInvited: r.not_invited };
    },
    async setAdmin({ email, admin }) {
      const { data, error } = await client.rpc('admin_set_admin', { p: { email, admin } });
      if (error) throw accessError(error);
      return fromDatabase('admin_set_admin', ACCESS_RPC.admin_set_admin.returns, data);
    },
  };
}
