// The study adapter's counts: progress per deck, the decks studied, the time per card, the days of study and what is
// due on the home page.
import type { Database } from '@qv/db-types/users';
import { STUDY_RPC } from '@qv/schema/user';
import { fromDatabase } from '../../../shared/lib/json';
import { dayNumber } from '@qv/study';
import type { HomeCounts } from './model';
import type { StudyRepository } from './port';
import type { StudyContext } from './supabase-context';

type Functions = Database['public']['Functions'];

function homeCountsFromJson(data: Functions['home_counts']['Returns'] | null): HomeCounts {
  const raw = fromDatabase('home_counts', STUDY_RPC.home_counts.returns, data ?? {});
  return {
    truncated: !!raw.truncated,
    decks: (raw.decks ?? []).map(([deckId, seen, hiddenNew, touched, suspended, recall, due]) => ({
      deckId,
      seen,
      hiddenNew,
      touched,
      suspended,
      recall,
      due: (due ?? []).map(([noteGuid, ord, queue, at]) => ({ noteGuid, ord, queue, due: at })),
    })),
  };
}

type ProgressReads = Pick<
  StudyRepository,
  'deckProgress' | 'answeredDecks' | 'medianAnswerMs' | 'heatmap' | 'homeCounts'
>;

export function progressReads({ client, fail, all }: StudyContext): ProgressReads {
  return {
    async deckProgress(dayStart) {
      const rows = await all('leer tu avance', (from, to) =>
        client
          .rpc('deck_progress', { day_start: dayStart.toISOString() })
          .order('deck_id')
          .range(from, to),
      );
      return rows.map((r) => ({
        deckId: r.deck_id,
        seen: r.seen,
        newSuspended: r.new_suspended,
        overdue: r.overdue,
        newToday: r.new_today,
        newYesterday: r.new_yesterday,
      }));
    },
    async answeredDecks() {
      const rows = await all('leer tus mazos estudiados', (from, to) =>
        client.rpc('answered_decks').order('deck_id').range(from, to),
      );
      return rows.map((r) => r.deck_id);
    },
    async medianAnswerMs() {
      const { data, error } = await client.rpc('median_answer_ms');
      if (error) fail('leer tu tiempo por tarjeta', error);
      return data ?? null;
    },
    async heatmap(deckIds) {
      const { data, error } = await client.rpc(
        'study_heatmap',
        deckIds === null ? {} : { p_deck_ids: deckIds },
      );
      if (error) fail('leer tus días de estudio', error);
      const raw = fromDatabase('study_heatmap', STUDY_RPC.study_heatmap.returns, data ?? {});
      return {
        days: (raw.days ?? []).map(([day, deckId, answers, practice]) => ({
          day: dayNumber(day),
          deckId,
          answers,
          practice,
        })),
        due: (raw.due ?? []).map(([day, cards]) => ({ day: dayNumber(day), cards })),
      };
    },
    async homeCounts(deckIds, until, decay) {
      if (!deckIds.length) return { decks: [], truncated: false };
      const { data, error } = await client.rpc('home_counts', {
        p_deck_ids: deckIds,
        p_until: until.toISOString(),
        p_decay: decay,
      });
      if (error) fail('leer tu avance', error);
      return homeCountsFromJson(data);
    },
  };
}
