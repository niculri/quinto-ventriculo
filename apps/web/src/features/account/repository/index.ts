// The account: its domain, the port, the Supabase adapter and the in-memory repository.
export { AccountError } from './model';
export type { AccountState } from './model';
export type { AccountRepository } from './port';
export { accountError, supabaseAccountRepository } from './supabase';
export { localAccountRepository } from './memory';
