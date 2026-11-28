// Administrators and invitations: their domain, the port, the Supabase adapter and the in-memory repository.
export { AccessError, MAX_EMAILS, normalizeEmail } from './model';
export type {
  AccessInvite,
  AccountLabel,
  AccessReport,
  InviteRejection,
  InviteResult,
  MoveResult,
  RemoveResult,
  SetAdminResult,
} from './model';
export type { AdminRepository } from './port';
export { supabaseAdminRepository } from './supabase';
export { localAdminRepository } from './memory';
