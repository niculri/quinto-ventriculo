// The account kept in the browser, for the demo and the tests.
import { ACCOUNT_DELETION_DAYS } from '@qv/schema';
import type { AccountRepository } from './port';
import { AccountError, MESSAGES } from './model';
import type { AcceptedVersions } from './model';

interface LocalAccount {
  accepted: AcceptedVersions | null;
  deletion: { requestedAt: string; deleteAfter: string } | null;
}

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
