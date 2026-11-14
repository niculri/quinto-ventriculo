// The user's study data (card states, review log, presets, preferences) in the RLS-protected users database: the
// parts of this folder's `supabase-*.ts` over one shared context.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@qv/db-types/users';
import type { StudyRepository } from './port';
import { studyContext } from './supabase-context';
import { progressReads } from './supabase-progress';
import { cardReads, logReads } from './supabase-reads';
import { deckSettings, preferencesAndPresets } from './supabase-settings';
import { cardSync, writes } from './supabase-writes';

export { CARDS_OF_DECKS_MAX } from './supabase-reads';

export function supabaseStudyRepository(client: SupabaseClient<Database>): StudyRepository {
  const ctx = studyContext(client);
  return {
    ...cardReads(ctx),
    ...logReads(ctx),
    ...preferencesAndPresets(ctx),
    ...deckSettings(ctx),
    ...progressReads(ctx),
    ...writes(ctx),
    ...cardSync(ctx),
  };
}
