// The study adapter's counts: progress per deck, the decks studied, the time per card, the days of study, what is due
// on the home page and the statistics of the student's cards.
import type { Database } from '@qv/db-types/users';
import { databaseError } from '@qv/schema/database';
import { STUDY_RPC } from '@qv/schema/user';
import { fromDatabase } from '../../../../shared/lib/json';
import { dayNumber } from '@qv/study';
import type { CardStatsData } from '@qv/study';
import type { HomeCounts } from './model';
import type { StudyRepository } from './port';
import { listOf } from './supabaseContext';
import type { StudyContext } from './supabaseContext';

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
      due: listOf(due).map(([noteGuid, ord, queue, at]) => ({ noteGuid, ord, queue, due: at })),
    })),
  };
}

function cardStatsFromJson(data: Functions['my_card_stats']['Returns'] | null): CardStatsData {
  const raw = fromDatabase('my_card_stats', STUDY_RPC.my_card_stats.returns, data);
  const [learning, relearning, young, mature, suspended, buried] = raw.cards;
  const [answers, ms, days] = raw.total;
  return {
    today: dayNumber(raw.today),
    cards: { learning, relearning, young, mature, suspended, buried },
    days: raw.days.map(([day, n, newCards, learn, time, yp, yf, mp, mf]) => ({
      day: dayNumber(day),
      answers: n,
      newCards,
      learning: learn,
      ms: time,
      youngPassed: yp,
      youngFailed: yf,
      maturePassed: mp,
      matureFailed: mf,
    })),
    due: raw.due.map(([day, cards]) => ({ day: dayNumber(day), cards })),
    overdue: raw.overdue,
    hardest: raw.hardest.map(([noteGuid, ord, deckId, lapses, reps]) => ({
      noteGuid,
      ord,
      deckId,
      lapses,
      reps,
    })),
    total: { answers, ms, days },
  };
}

type ProgressReads = Pick<
  StudyRepository,
  'deckProgress' | 'answeredDecks' | 'medianAnswerMs' | 'heatmap' | 'homeCounts' | 'cardStats'
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
    async heatmap(deckIds, quizIds = null) {
      const decks = deckIds === null ? {} : { p_deck_ids: deckIds };
      let { data, error } = await client.rpc('study_heatmap', {
        ...decks,
        ...(quizIds === null ? {} : { p_quiz_ids: quizIds }),
      });
      // A users' database from before the tests in the heatmap: the days of Anki alone.
      if (error && quizIds !== null && databaseError(error).hasCode('PGRST202')) {
        ({ data, error } = await client.rpc('study_heatmap', decks));
      }
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
        tests: (raw.tests ?? []).map(([day, quizId, answers]) => ({
          day: dayNumber(day),
          quizId,
          answers,
        })),
      };
    },
    async cardStats(deckIds) {
      const { data, error } = await client.rpc(
        'my_card_stats',
        deckIds === null ? {} : { p_deck_ids: deckIds },
      );
      if (error && databaseError(error).hasCode('PGRST202')) {
        throw new Error(
          'Tus estadísticas todavía no están disponibles. Vuelve a intentarlo más tarde.',
        );
      }
      if (error) fail('leer tus estadísticas', error);
      return cardStatsFromJson(data);
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
