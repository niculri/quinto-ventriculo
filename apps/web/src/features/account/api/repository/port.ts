// The port of the account: what the Supabase adapter and the in-memory repository both implement.
import type { AccountState } from './model';

export interface AccountRepository {
  /** Entering also cancels a requested deletion. */
  resume(versions: { terms: string; privacy: string }): Promise<AccountState>;
  accept(versions: { terms: string; privacy: string }): Promise<{ acceptedAt: string }>;
  exportData(): Promise<Blob>;
  requestDeletion(email: string): Promise<{ deleteAfter: string }>;
}
