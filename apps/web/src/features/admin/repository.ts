import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeckImpact } from '@qv/schema';

/**
 * Administrators and reports of errors in the cards, in the USERS database. The database decides who is an
 * administrator and what each one can read (RLS and `is_admin()`); the web only uses the answer to show the panel.
 */

/** What a student sends from a card. */
export interface NewCardReport {
  noteGuid: string;
  ord: number;
  deckId: string | null;
  code: string | null;
  version: number | null;
  comment: string;
}

export type ReportStatus = 'open' | 'resolved';

/** A report as the panel shows it, with who wrote it. */
export interface CardReport extends NewCardReport {
  id: string;
  status: ReportStatus;
  createdAt: string;
  resolvedAt: string | null;
  reporterEmail: string | null;
  reporterName: string | null;
}

/** An invitation, as «Acceso» shows it (step 2.10; `access_report()` of step 2.1). */
export interface AccessInvite {
  email: string;
  list: string;
  note: string | null;
  invitedBy: string | null;
  invitedAt: string;
  /** In admin_emails: the panel never removes them. */
  admin: boolean;
  hasAccount: boolean;
  lastSignInAt: string | null;
}

export interface AccessReport {
  /** The whole domain is in (step 4): removing an invitation does not take away access. Only read here. */
  openToDomain: boolean;
  lists: { list: string; invited: number; withAccount: number }[];
  /** By list, then by email. */
  invited: AccessInvite[];
  /** Accounts that exist without an invitation (there should be none). */
  accountsWithoutInvite: { email: string; createdAt: string; lastSignInAt: string | null }[];
  /** The owner of the site (step 2.10 b): never removed as an administrator. Null until the row is marked. */
  owner: string | null;
  /** Whoever is looking is the owner: only they name and remove administrators. */
  youAreOwner: boolean;
}

/** What naming or removing an administrator did. `changed` is false when it already was as asked. */
export interface SetAdminResult {
  email: string;
  admin: boolean;
  changed: boolean;
}

export type InviteRejection = 'domain' | 'invalid' | 'repeated' | 'empty';

/** What inviting did: who came in, who was already there (their list does not change) and what was refused. */
export interface InviteResult {
  added: string[];
  already: string[];
  rejected: { email: string; reason: InviteRejection }[];
}

/** What removing did. `keptAdmins`: administrators, never removed from the panel. */
export interface RemoveResult {
  removed: string[];
  notInvited: string[];
  keptAdmins: string[];
  sessionsClosed: number;
  openToDomain: boolean;
}

/** At most this many emails per call (invite_emails() and remove_invites()). */
export const MAX_EMAILS = 500;

/** What the database refuses in «Acceso», said in Spanish. */
export class AccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccessError';
  }
}

export interface AdminRepository {
  isAdmin(): Promise<boolean>;
  reportCard(report: NewCardReport): Promise<void>;
  /** Every report, the newest first. Only for an administrator. */
  listReports(): Promise<CardReport[]>;
  setReportStatus(id: string, status: ReportStatus): Promise<void>;
  /**
   * Whom a release reaches (step 1.7): by deck, how many students saw some of its cards, how many cards in all and how
   * many turned it on. Only for an administrator; at most 300 decks (`admin_deck_impact()`).
   */
  deckImpact(deckIds: readonly string[]): Promise<DeckImpact[]>;
  /** «Acceso» (step 2.10): the invitations, the lists and the accounts without one. Only for an administrator. */
  accessReport(): Promise<AccessReport>;
  /** Invites `emails` in `list` (new or existing), with an optional note; who invites is the administrator. */
  invite(input: { emails: string[]; list: string; note: string | null }): Promise<InviteResult>;
  /** Removes some people or a whole list, never an administrator; their sessions close. */
  removeInvites(target: { emails: string[] } | { list: string }): Promise<RemoveResult>;
  /**
   * Names an invited person administrator, or removes one (step 2.10 b). Only the owner; never the owner.
   */
  setAdmin(input: { email: string; admin: boolean }): Promise<SetAdminResult>;
}

interface ReportRow {
  id: string;
  note_guid: string;
  ord: number;
  deck_id: string | null;
  card_code: string | null;
  card_version: number | null;
  comment: string;
  status: ReportStatus;
  created_at: string;
  resolved_at: string | null;
  reporter_email: string | null;
  reporter_name: string | null;
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
  /** Step 2.10 b (…_admin_owner.sql); absent from a database of before that step. */
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

/** The database's refusal (admin_*() of the users' database), in words for the panel. */
function accessError(error: { code?: string; message: string }): AccessError {
  if (error.code === '28000' || /session_closed/.test(error.message)) {
    return new AccessError('Tu sesión se cerró. Sal y vuelve a entrar.');
  }
  // Step 2.10 b: before the codes (they share 42501 and P0002 with the refusals of step 2.10).
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
  // Revisión de cero (2.10): the messages of each refusal, not any that names the key («expected { "emails": [...],
  // "list": … }» also does).
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
    async reportCard(r) {
      const { error } = await client.from('card_reports').insert({
        note_guid: r.noteGuid,
        ord: r.ord,
        deck_id: r.deckId,
        card_code: r.code,
        card_version: r.version,
        comment: r.comment,
      });
      if (error) throw error;
    },
    async listReports() {
      const { data, error } = await client.rpc('admin_card_reports');
      if (error) throw error;
      return (data as ReportRow[]).map((r) => ({
        id: r.id,
        noteGuid: r.note_guid,
        ord: r.ord,
        deckId: r.deck_id,
        code: r.card_code,
        version: r.card_version,
        comment: r.comment,
        status: r.status,
        createdAt: r.created_at,
        resolvedAt: r.resolved_at,
        reporterEmail: r.reporter_email,
        reporterName: r.reporter_name,
      }));
    },
    async setReportStatus(id, status) {
      const { error } = await client
        .from('card_reports')
        .update({ status, resolved_at: status === 'resolved' ? new Date().toISOString() : null })
        .eq('id', id);
      if (error) throw error;
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

/** An invitation of the demo and the tests (made-up people). */
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

/**
 * The email as invite_emails() takes it: lowercase, without any space (also the invisible ones a paste brings).
 * The database does the same; this is for the demo and for counting what the form will send.
 */
export const normalizeEmail = (raw: string) =>
  raw.replace(/(?:[\s\u00a0\u2007\u202f\u200b\u200c\u2060\ufeff]|\u200d)+/g, '').toLowerCase();

/** The demo and the tests, without a database: the reports and the invitations stay in this browser (or in memory). */
export function localAdminRepository(
  options: {
    admin?: boolean;
    storage?: Storage | null;
    /** Who the administrator is (who invites). */
    email?: string;
    /** They are the owner of the site (step 2.10 b); by default, the administrator is. */
    owner?: boolean;
    /** The invitations to start with (by default, made-up ones). */
    invites?: AccessInvite[];
    accountsWithoutInvite?: AccessReport['accountsWithoutInvite'];
    openToDomain?: boolean;
  } = {},
): AdminRepository {
  const storage = options.storage ?? null;
  const KEY = 'qv-demo-reports';
  let memory: CardReport[] = [];
  const read = (): CardReport[] => {
    if (!storage) return memory;
    try {
      return JSON.parse(storage.getItem(KEY) ?? '[]') as CardReport[];
    } catch {
      return [];
    }
  };
  const write = (list: CardReport[]) => {
    memory = list;
    try {
      storage?.setItem(KEY, JSON.stringify(list));
    } catch {
      // blocked storage: they stay in memory
    }
  };
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
  // Who the owner is: the administrator, if they are; if not, nobody of these invitations (the owner is somebody else).
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
        // The demo closes one session for each person removed.
        sessionsClosed: removed.length,
        openToDomain: options.openToDomain ?? false,
      };
    },
    async reportCard(r) {
      write([
        {
          ...r,
          id: crypto.randomUUID(),
          status: 'open',
          createdAt: new Date().toISOString(),
          resolvedAt: null,
          reporterEmail: 'demo@ug.uchile.cl',
          reporterName: 'Estudiante de prueba',
        },
        ...read(),
      ]);
    },
    listReports: async () => read(),
    async setReportStatus(id, status) {
      write(
        read().map((r) =>
          r.id === id
            ? { ...r, status, resolvedAt: status === 'resolved' ? new Date().toISOString() : null }
            : r,
        ),
      );
    },
    // Nobody else studies in the demo.
    deckImpact: async (deckIds) =>
      deckIds.map((deckId) => ({ deckId, studentsSeen: 0, cardsSeen: 0, studentsActive: 0 })),
  };
}
