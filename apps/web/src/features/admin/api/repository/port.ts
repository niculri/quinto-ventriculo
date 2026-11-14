// The port of administrators and invitations: what the Supabase adapter and the in-memory repository implement.
import type { DeckImpact } from '@qv/schema';
import type { AccessReport, InviteResult, RemoveResult, SetAdminResult } from './model';

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
