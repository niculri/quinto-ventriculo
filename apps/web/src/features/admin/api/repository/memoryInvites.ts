// The rules of the invitations of the in-memory administration repository, as invite_emails(), remove_invites() and
// admin_move_invites() apply them.
import type { DeckImpact } from '@qv/schema';
import { AccessError, MAX_EMAILS, normalizeEmail } from './model';
import { blankToNull } from '../../../../shared/lib/blankToNull';
import type { AccessInvite, InviteResult, MoveResult, RemoveResult, SetAdminResult } from './model';

const TOO_MANY = `A lo más ${MAX_EMAILS} correos por vez.`;
/** What the Supabase adapter says for a refusal it does not name. */
const FAILED = 'No se pudo. Revisa tu conexión e intenta de nuevo.';
/** Characters as the database counts them (code points, not UTF-16 units). */
const length = (text: string) => Array.from(text).length;

/** Why an email is not invited, in the order invite_emails() checks it. */
function refusalOf(
  email: string,
  seen: Set<string>,
): InviteResult['rejected'][number]['reason'] | null {
  if (!email) return 'empty';
  if (!email.endsWith('@ug.uchile.cl')) return 'domain';
  if (!/^[a-z0-9._%+-]+@ug\.uchile\.cl$/.test(email)) return 'invalid';
  return seen.has(email) ? 'repeated' : null;
}

/** The invitations with the new ones added, and what became of each email, in the order invite_emails() checks them. */
export function addInvites(
  invites: AccessInvite[],
  { emails, list, note }: { emails: string[]; list: string; note: string | null },
  by: string,
): { result: InviteResult; next: AccessInvite[] } {
  const name = list.trim();
  const kept = blankToNull(note?.trim());
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
    const refusal = refusalOf(email, seen);
    if (refusal)
      result.rejected.push({ email: refusal === 'empty' ? raw : email, reason: refusal });
    else {
      seen.add(email);
      if (next.some((i) => i.email === email)) result.already.push(email);
      else {
        result.added.push(email);
        next.push({
          email,
          list: name,
          note: kept,
          invitedBy: by,
          invitedAt: at,
          admin: false,
          hasAccount: false,
          lastSeenAt: null,
        });
      }
    }
  }
  return { result, next };
}

/** The invitations that remain after removing a list or some emails (never an administrator), and what was done. */
export function removeFromInvites(
  invites: AccessInvite[],
  target: { emails: string[] } | { list: string },
  openToDomain: boolean,
): { result: RemoveResult; next: AccessInvite[] } {
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
  return {
    next: invites.filter((i) => !removed.includes(i.email)),
    result: {
      removed,
      notInvited: targets.filter((e) => !removed.includes(e)).sort(),
      keptAdmins,
      // The demo has no sessions: one for each person removed.
      sessionsClosed: removed.length,
      openToDomain,
    },
  };
}

/** The invitations with each one moved to their list and `by` as who put them there, and what became of each email. */
export function moveInInvites(
  invites: AccessInvite[],
  moves: { email: string; list: string }[],
  by: string,
): { result: MoveResult; next: AccessInvite[] } {
  if (moves.length > MAX_EMAILS) throw new AccessError(TOO_MANY);
  const asked = moves.map((m) => ({ email: normalizeEmail(m.email), list: m.list.trim() }));
  if (asked.some((m) => !m.list || length(m.list) > 60)) {
    throw new AccessError('El nombre de la lista tiene que tener entre 1 y 60 letras.');
  }
  const emails = asked.map((m) => m.email).filter(Boolean);
  if (new Set(emails).size !== emails.length) throw new AccessError(FAILED);
  const byEmail = new Map(invites.map((i) => [i.email, i]));
  const sorted = [...asked].sort((a, b) => a.email.localeCompare(b.email));
  const moved = sorted.flatMap((m) => {
    const found = byEmail.get(m.email);
    return found && found.list !== m.list ? [{ email: m.email, from: found.list, to: m.list }] : [];
  });
  const to = new Map(moved.map((m) => [m.email, m.to]));
  return {
    next: invites.map((i) => {
      const list = to.get(i.email);
      return list ? { ...i, list, invitedBy: by } : i;
    }),
    result: {
      moved,
      already: sorted.filter((m) => byEmail.get(m.email)?.list === m.list).map((m) => m.email),
      notInvited: sorted.filter((m) => !byEmail.has(m.email)).map((m) => m.email),
    },
  };
}

/** As admin_deck_impact(), but nobody else studies in the demo. */
export function deckImpactOf(deckIds: readonly string[]): DeckImpact[] {
  if (deckIds.length > 300) throw new AccessError('admin_deck_impact: at most 300 decks');
  const ids = [...new Set(deckIds.filter((id) => /^[0-9]{1,20}$/.test(id)))].sort();
  return ids.map((deckId) => ({ deckId, studentsSeen: 0, cardsSeen: 0, studentsActive: 0 }));
}

/** The invitations with one more or one less administrator, and what changed; only the site owner can do it. */
export function withAdminSet(
  invites: AccessInvite[],
  { email, admin }: { email: string; admin: boolean },
  { youAreOwner, ownerEmail }: { youAreOwner: boolean; ownerEmail: string | null },
): { result: SetAdminResult; next: AccessInvite[] } {
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
  const next = changed ? invites.map((i) => (i.email === e ? { ...i, admin } : i)) : invites;
  return { result: { email: e, admin, changed }, next };
}
