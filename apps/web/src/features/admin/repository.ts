// Administrators and invitations in the users database. The database decides who is an administrator and what each
// one can read (RLS and `is_admin()`); the web only uses the answer to show the panel.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeckImpact } from '@qv/schema';

export interface AccessInvite {
  email: string;
  list: string;
  note: string | null;
  invitedBy: string | null;
  invitedAt: string;
  admin: boolean;
  hasAccount: boolean;
  lastSignInAt: string | null;
}

export interface AccessReport {
  /** Only read here: removing an invitation does not take away access. */
  openToDomain: boolean;
  lists: { list: string; invited: number; withAccount: number }[];
  invited: AccessInvite[];
  accountsWithoutInvite: { email: string; createdAt: string; lastSignInAt: string | null }[];
  /** Never removed as an administrator; null until the row is marked. */
  owner: string | null;
  youAreOwner: boolean;
}

/** `changed` is false when it already was as asked. */
export interface SetAdminResult {
  email: string;
  admin: boolean;
  changed: boolean;
}

export type InviteRejection = 'domain' | 'invalid' | 'repeated' | 'empty';

export interface InviteResult {
  added: string[];
  already: string[];
  rejected: { email: string; reason: InviteRejection }[];
}

export interface RemoveResult {
  removed: string[];
  notInvited: string[];
  keptAdmins: string[];
  sessionsClosed: number;
  openToDomain: boolean;
}

export const MAX_EMAILS = 500;

export class AccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccessError';
  }
}

export interface AdminRepository {
  isAdmin(): Promise<boolean>;
  /** Only for an administrator; at most 300 decks. */
  deckImpact(deckIds: readonly string[]): Promise<DeckImpact[]>;
  accessReport(): Promise<AccessReport>;
  invite(input: { emails: string[]; list: string; note: string | null }): Promise<InviteResult>;
  /** Their sessions close; an administrator is never removed. */
  removeInvites(target: { emails: string[] } | { list: string }): Promise<RemoveResult>;
  setAdmin(input: { email: string; admin: boolean }): Promise<SetAdminResult>;
}

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

export function supabaseAdminRepository(client: SupabaseClient): AdminRepository {
  return {
    async isAdmin() {
      const { data, error } = await client.rpc('is_admin');
      if (error) throw error;
      return data === true;
    },
    async deckImpact(deckIds) {
      const { data, error } = await client.rpc('admin_deck_impact', { deck_ids: deckIds });
      if (error) throw error;
      return (
        data as {
          deck_id: string;
          students_seen: number;
          cards_seen: number;
          students_active: number;
        }[]
      ).map((r) => ({
        deckId: r.deck_id,
        studentsSeen: r.students_seen,
        cardsSeen: r.cards_seen,
        studentsActive: r.students_active,
      }));
    },
    async accessReport() {
      const { data, error } = await client.rpc('admin_access_report');
      if (error) throw accessError(error);
      return accessReportOf(data as AccessReportRow);
    },
    async invite({ emails, list, note }) {
      const { data, error } = await client.rpc('admin_invite_emails', {
        p: { emails, list, ...(note ? { note } : {}) },
      });
      if (error) throw accessError(error);
      const r = data as {
        added_emails: string[];
        already_emails: string[];
        rejected: { email: string; reason: InviteRejection }[];
      };
      return { added: r.added_emails, already: r.already_emails, rejected: r.rejected };
    },
    async removeInvites(target) {
      const { data, error } = await client.rpc('admin_remove_invites', { p: target });
      if (error) throw accessError(error);
      const r = data as {
        removed: string[];
        not_invited: string[];
        kept_admins: string[];
        sessions_closed: number;
        open_to_domain: boolean;
      };
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
      return data as SetAdminResult;
    },
  };
}

const DEMO_INVITES: AccessInvite[] = [
  invite('demo@ug.uchile.cl', 'Equipo', true, true),
  invite('ana.perez@ug.uchile.cl', 'Curso de prueba', false, true),
  invite('luis.soto@ug.uchile.cl', 'Curso de prueba', false, false),
];
function invite(email: string, list: string, admin: boolean, hasAccount: boolean): AccessInvite {
  return {
    email,
    list,
    note: null,
    invitedBy: 'demo@ug.uchile.cl',
    invitedAt: '2026-11-01T12:00:00.000Z',
    admin,
    hasAccount,
    lastSignInAt: hasAccount ? '2026-11-07T15:30:00.000Z' : null,
  };
}

// Lowercase and without any space, also the invisible ones a paste brings, as invite_emails() does; for the demo and
// for counting what the form will send.
export const normalizeEmail = (raw: string) =>
  raw.replace(/(?:[\s\u00a0\u2007\u202f\u200b\u200c\u2060\ufeff]|\u200d)+/g, '').toLowerCase();

export function localAdminRepository(
  options: {
    admin?: boolean;
    storage?: Storage | null;
    email?: string;
    owner?: boolean;
    invites?: AccessInvite[];
    accountsWithoutInvite?: AccessReport['accountsWithoutInvite'];
    openToDomain?: boolean;
  } = {},
): AdminRepository {
  const storage = options.storage ?? null;
  const ACCESS = 'qv-demo-access';
  let invites: AccessInvite[] = options.invites ?? DEMO_INVITES;
  try {
    const kept = storage?.getItem(ACCESS);
    if (kept) invites = JSON.parse(kept) as AccessInvite[];
  } catch {
    // blocked storage: the defaults
  }
  const keepInvites = (list: AccessInvite[]) => {
    invites = list;
    try {
      storage?.setItem(ACCESS, JSON.stringify(list));
    } catch {
      // blocked storage: they stay in memory
    }
  };
  const onlyAdmin = async () => {
    if (!(options.admin ?? false)) throw new AccessError('Solo para administradores.');
  };
  const me = options.email ?? 'demo@ug.uchile.cl';
  const youAreOwner = (options.admin ?? false) && (options.owner ?? true);
  // The site owner is the administrator, if they are; if not, somebody outside these invitations.
  const ownerEmail = youAreOwner ? me : null;
  const sorted = (list: AccessInvite[]) =>
    [...list].sort((a, b) => a.list.localeCompare(b.list) || a.email.localeCompare(b.email));
  return {
    isAdmin: async () => options.admin ?? false,
    async accessReport() {
      await onlyAdmin();
      const lists = [...new Set(invites.map((i) => i.list))].sort();
      return {
        openToDomain: options.openToDomain ?? false,
        lists: lists.map((list) => ({
          list,
          invited: invites.filter((i) => i.list === list).length,
          withAccount: invites.filter((i) => i.list === list && i.hasAccount).length,
        })),
        invited: sorted(invites),
        accountsWithoutInvite: options.accountsWithoutInvite ?? [],
        owner: ownerEmail,
        youAreOwner,
      };
    },
    async setAdmin({ email, admin }) {
      await onlyAdmin();
      if (!youAreOwner) {
        throw new AccessError('Solo el dueño del sitio nombra o quita administradores.');
      }
      const e = normalizeEmail(email);
      const found = invites.find((i) => i.email === e);
      if (!admin && e === ownerEmail) throw new AccessError('Al dueño del sitio no se le quita.');
      if (admin && !found) {
        throw new AccessError('Primero tiene que estar invitado. Recarga la página.');
      }
      const changed = !!found && found.admin !== admin;
      if (changed) keepInvites(invites.map((i) => (i.email === e ? { ...i, admin } : i)));
      return { email: e, admin, changed };
    },
    async invite({ emails, list, note }) {
      await onlyAdmin();
      const name = list.trim();
      if (!name || name.length > 60) {
        throw new AccessError('El nombre de la lista tiene que tener entre 1 y 60 letras.');
      }
      if (emails.length > MAX_EMAILS)
        throw new AccessError(`A lo más ${MAX_EMAILS} correos por vez.`);
      const result: InviteResult = { added: [], already: [], rejected: [] };
      const seen = new Set<string>();
      const next = [...invites];
      for (const raw of emails) {
        const email = normalizeEmail(raw);
        if (!email) result.rejected.push({ email: raw, reason: 'empty' });
        else if (!email.endsWith('@ug.uchile.cl'))
          result.rejected.push({ email, reason: 'domain' });
        else if (!/^[a-z0-9._%+-]+@ug\.uchile\.cl$/.test(email)) {
          result.rejected.push({ email, reason: 'invalid' });
        } else if (seen.has(email)) result.rejected.push({ email, reason: 'repeated' });
        else {
          seen.add(email);
          if (next.some((i) => i.email === email)) result.already.push(email);
          else {
            result.added.push(email);
            next.push({
              email,
              list: name,
              note: note?.trim() || null,
              invitedBy: me,
              invitedAt: new Date().toISOString(),
              admin: false,
              hasAccount: false,
              lastSignInAt: null,
            });
          }
        }
      }
      keepInvites(next);
      return result;
    },
    async removeInvites(target) {
      await onlyAdmin();
      const asked =
        'list' in target
          ? invites.filter((i) => i.list === target.list).map((i) => i.email)
          : [...new Set(target.emails.map(normalizeEmail).filter(Boolean))];
      if ('list' in target && !asked.length) {
        throw new AccessError('Esa lista ya no existe. Recarga la página.');
      }
      const admins = new Set(invites.filter((i) => i.admin).map((i) => i.email));
      const keptAdmins = asked.filter((e) => admins.has(e)).sort();
      const targets = asked.filter((e) => !admins.has(e));
      const removed = targets.filter((e) => invites.some((i) => i.email === e)).sort();
      keepInvites(invites.filter((i) => !removed.includes(i.email)));
      return {
        removed,
        notInvited: targets.filter((e) => !removed.includes(e)).sort(),
        keptAdmins,
        sessionsClosed: removed.length,
        openToDomain: options.openToDomain ?? false,
      };
    },
    // Nobody else studies in the demo.
    deckImpact: async (deckIds) =>
      deckIds.map((deckId) => ({ deckId, studentsSeen: 0, cardsSeen: 0, studentsActive: 0 })),
  };
}
