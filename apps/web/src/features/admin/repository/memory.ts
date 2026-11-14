// Administrators and invitations kept in the browser, for the demo, the preview and the tests.
import type { AdminRepository } from './port';
import { AccessError, MAX_EMAILS, normalizeEmail } from './model';
import type { AccessInvite, AccessReport, InviteResult } from './model';

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

const TOO_MANY = `A lo más ${MAX_EMAILS} correos por vez.`;
/** What the Supabase adapter says for a refusal it does not name. */
const FAILED = 'No se pudo. Revisa tu conexión e intenta de nuevo.';
/** Characters as the database counts them (code points, not UTF-16 units). */
const length = (text: string) => [...text].length;

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
      if (!e) throw new AccessError(FAILED);
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
      // In the order invite_emails() checks them, counting characters as the database does.
      const name = list.trim();
      const kept = note?.trim() || null;
      if (emails.length > MAX_EMAILS) throw new AccessError(TOO_MANY);
      if (!name || length(name) > 60) {
        throw new AccessError('El nombre de la lista tiene que tener entre 1 y 60 letras.');
      }
      if (kept && length(kept) > 200) throw new AccessError('La nota tiene a lo más 200 letras.');
      const result: InviteResult = { added: [], already: [], rejected: [] };
      const at = new Date().toISOString();
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
              note: kept,
              invitedBy: me,
              invitedAt: at,
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
      const list = 'list' in target ? target.list.trim() : null;
      if (list === '') throw new AccessError(FAILED);
      if ('emails' in target && target.emails.length > MAX_EMAILS) {
        throw new AccessError(TOO_MANY);
      }
      const asked =
        'list' in target
          ? invites.filter((i) => i.list === list).map((i) => i.email)
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
        // The demo has no sessions: one for each person removed.
        sessionsClosed: removed.length,
        openToDomain: options.openToDomain ?? false,
      };
    },
    // As admin_deck_impact(), but nobody else studies in the demo.
    async deckImpact(deckIds) {
      await onlyAdmin();
      if (deckIds.length > 300) throw new AccessError('admin_deck_impact: at most 300 decks');
      const ids = [...new Set(deckIds.filter((id) => /^[0-9]{1,20}$/.test(id)))].sort();
      return ids.map((deckId) => ({ deckId, studentsSeen: 0, cardsSeen: 0, studentsActive: 0 }));
    },
  };
}
