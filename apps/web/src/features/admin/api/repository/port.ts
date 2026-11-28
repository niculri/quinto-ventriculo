// The port of administrators and invitations: what the Supabase adapter and the in-memory repository implement.
import type { DeckImpact } from '@qv/schema';
import type {
  AccessReport,
  AccountLabel,
  InviteResult,
  MoveResult,
  RemoveResult,
  SetAdminResult,
} from './model';

export interface AdminRepository {
  isAdmin(): Promise<boolean>;
  /** Only for an administrator; at most 300 decks. */
  deckImpact(deckIds: readonly string[]): Promise<DeckImpact[]>;
  accessReport(): Promise<AccessReport>;
  invite(input: { emails: string[]; list: string; note: string | null }): Promise<InviteResult>;
  /** Their sessions close; an administrator is never removed. */
  removeInvites(target: { emails: string[] } | { list: string }): Promise<RemoveResult>;
  /** Each email to its own list; access, sessions and progress do not change. */
  moveInvites(moves: { email: string; list: string }[]): Promise<MoveResult>;
  setAdmin(input: { email: string; admin: boolean }): Promise<SetAdminResult>;
  /** Only for an administrator; at most 500. An account that no longer exists does not come back. */
  accountLabels(ids: readonly string[]): Promise<AccountLabel[]>;
}
