// What each student read of the announcements: the port, the Supabase adapter and the in-memory repository.
export type { NewsRepository } from './port';
export { supabaseNewsRepository } from './supabase';
export { localNewsRepository } from './memory';
