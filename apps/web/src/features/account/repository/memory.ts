// The account kept in the browser, for the demo and the tests.
import { ACCOUNT_DELETION_DAYS } from '@qv/schema';
import { normalizeEmail } from '../../../shared/lib/email';
import type { AccountRepository } from './port';
import { AccountError, MESSAGES } from './model';
import type { AcceptedVersions } from './model';

interface LocalAccount {
  /** One per pair of versions, with the date it was first accepted (as legal_acceptances). */
  acceptances: AcceptedVersions[];
  deletion: { requestedAt: string; deleteAfter: string } | null;
}

/** Also as it was kept before there was one acceptance per pair of versions: only the last one, `accepted`. */
type Saved = Partial<LocalAccount> & { accepted?: AcceptedVersions | null };

function fromSaved({ accepted, ...rest }: Saved): Partial<LocalAccount> {
  return { ...(accepted ? { acceptances: [accepted] } : {}), ...rest };
}

const sameVersions = (a: AcceptedVersions, v: { terms: string; privacy: string }) =>
  a.terms === v.terms && a.privacy === v.privacy;

const desc = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);

/** As resume_account(): the versions asked about if they were accepted, otherwise the last accepted. */
function lastAccepted(list: AcceptedVersions[], asked: { terms: string; privacy: string }) {
  const sorted = [...list].sort(
    (a, b) =>
      Number(sameVersions(b, asked)) - Number(sameVersions(a, asked)) ||
      Date.parse(b.acceptedAt) - Date.parse(a.acceptedAt) ||
      desc(a.terms, b.terms) ||
      desc(a.privacy, b.privacy),
  );
  return sorted[0] ?? null;
}

export function localAccountRepository(
  options: {
    storage?: Storage | null;
    email?: string;
    initial?: Saved;
    exported?: () => unknown;
  } = {},
): AccountRepository {
  const storage = options.storage ?? null;
  const KEY = 'qv-demo-account';
  let memory: LocalAccount = {
    acceptances: [],
    deletion: null,
    ...fromSaved(options.initial ?? {}),
  };
  const read = (): LocalAccount => {
    if (!storage) return memory;
    try {
      const saved = storage.getItem(KEY);
      if (!saved) return memory;
      return { ...memory, ...fromSaved(JSON.parse(saved) as Saved) };
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
    async resume(versions) {
      const now = read();
      // Signing out came with asking: entering again is always «before the 7 days» here.
      if (now.deletion) write({ ...now, deletion: null });
      return {
        accepted: lastAccepted(now.acceptances, versions),
        deletionCancelled: now.deletion !== null,
      };
    },
    async accept(versions) {
      const now = read();
      const kept = now.acceptances.find((a) => sameVersions(a, versions));
      if (kept) return { acceptedAt: kept.acceptedAt };
      const acceptedAt = new Date().toISOString();
      const accepted = { terms: versions.terms, privacy: versions.privacy, acceptedAt };
      write({ ...now, acceptances: [...now.acceptances, accepted] });
      return { acceptedAt };
    },
    async exportData() {
      const data = {
        site: 'El Quinto Ventrículo',
        format: 1,
        exported_at: new Date().toISOString(),
        account: { email: options.email ?? null },
        tables: { legal_acceptances: read().acceptances },
        ...(options.exported ? { demo: options.exported() } : {}),
      };
      return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    },
    async requestDeletion(email) {
      if (normalizeEmail(email) !== (options.email ?? '').trim().toLowerCase()) {
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
