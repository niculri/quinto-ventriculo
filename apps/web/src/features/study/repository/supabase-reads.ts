// The study adapter's reads of card states and of the review log, each row checked against its schema.
import { databaseError } from '@qv/schema/database';
import { AnswerTodayRow, CardLogRow, RatedInDeckRow, RatedRow, STUDY_RPC } from '@qv/schema/user';
import { fromDatabase } from '../../../lib/json';
import type { StudyRepository } from './port';
import { chunks, fromRow } from './supabase-context';
import type { StudyContext } from './supabase-context';

export const CARDS_OF_DECKS_MAX = 5000;

const CardStateRows = STUDY_RPC.card_states_of_decks.returns;
const CardLogRows = CardLogRow.array();
const RatedRows = RatedRow.array();
const RatedInDeckRows = RatedInDeckRow.array();
const AnswerTodayRows = AnswerTodayRow.array();

type CardReads = Pick<StudyRepository, 'cards' | 'allCards' | 'cardLog'>;

export function cardReads({ client, fail, all }: StudyContext): CardReads {
  return {
    // The decks of an assessment or a course in one call (card_states_of_decks()), only the student's rows of them.
    // A users' database from before that function does not have it: then a page at a time.
    async cards(deckIds) {
      if (!deckIds.length) return [];
      const paged = async (ids: string[]) =>
        fromDatabase(
          'card_states',
          CardStateRows,
          await all('leer tu avance en el mazo', (from, to) =>
            client
              .from('card_states')
              .select('*')
              .in('deck_id', ids)
              .order('note_guid')
              .order('ord')
              .range(from, to),
          ),
        );
      const parts = await Promise.all(
        chunks(deckIds, CARDS_OF_DECKS_MAX).map(async (ids) => {
          const { data, error } = await client.rpc('card_states_of_decks', { p_deck_ids: ids });
          if (!error) return fromDatabase('card_states_of_decks', CardStateRows, data ?? []);
          if (databaseError(error).hasCode('PGRST202')) {
            return (await Promise.all(chunks(ids).map(paged))).flat();
          }
          return fail('leer tu avance en el mazo', error);
        }),
      );
      return parts.flat().map(fromRow);
    },
    async allCards() {
      const rows = await all('leer tu avance', (from, to) =>
        client.from('card_states').select('*').order('note_guid').order('ord').range(from, to),
      );
      return fromDatabase('card_states', CardStateRows, rows).map(fromRow);
    },
    async cardLog(card) {
      const rows = await all('leer el historial de la tarjeta', (from, to) =>
        client
          .from('review_log')
          .select(
            'action, reviewed_at, rating, queue_before, phase_before, phase_after, interval, stability_after, difficulty_after, duration_ms',
          )
          .eq('note_guid', card.noteGuid)
          .eq('ord', card.ord)
          .order('id')
          .range(from, to),
      );
      return fromDatabase('review_log', CardLogRows, rows).map((r) => ({
        action: r.action,
        reviewedAt: new Date(r.reviewed_at).toISOString(),
        rating: r.rating,
        queueBefore: r.queue_before,
        phaseBefore: r.phase_before,
        phaseAfter: r.phase_after,
        interval: r.interval,
        stability: r.stability_after,
        difficulty: r.difficulty_after,
        durationMs: r.duration_ms,
      }));
    },
  };
}

type LogReads = Pick<
  StudyRepository,
  'ratedSince' | 'ratedBetween' | 'firstAnswersSince' | 'answersSince'
>;

export function logReads({ client, all }: StudyContext): LogReads {
  return {
    async ratedSince(since) {
      const rows = await all('leer tus repasos', (from, to) =>
        client
          .from('review_log')
          .select('note_guid, ord, rating, reviewed_at')
          .not('rating', 'is', null)
          .gte('reviewed_at', since.toISOString())
          .order('id')
          .range(from, to),
      );
      return fromDatabase('review_log', RatedRows, rows).map((r) => ({
        noteGuid: r.note_guid,
        ord: r.ord,
        rating: r.rating,
        reviewedAt: new Date(r.reviewed_at).toISOString(),
      }));
    },
    async ratedBetween(from, to) {
      const rows = await all('leer tus repasos de ese día', (start, end) =>
        client
          .from('review_log')
          .select('note_guid, ord, deck_id, rating, reviewed_at')
          .not('rating', 'is', null)
          .gte('reviewed_at', from.toISOString())
          .lt('reviewed_at', to.toISOString())
          .order('id')
          .range(start, end),
      );
      return fromDatabase('review_log', RatedInDeckRows, rows).map((r) => ({
        noteGuid: r.note_guid,
        ord: r.ord,
        deckId: r.deck_id,
        rating: r.rating,
        reviewedAt: new Date(r.reviewed_at).toISOString(),
      }));
    },
    async firstAnswersSince(since) {
      const rows = await all('leer tus tarjetas introducidas', (from, to) =>
        client
          .rpc('first_answers_since', { since: since.toISOString() })
          .order('note_guid')
          .order('ord')
          .range(from, to),
      );
      return rows.map((r) => ({
        noteGuid: r.note_guid,
        ord: r.ord,
        at: new Date(r.first_at).toISOString(),
      }));
    },
    async answersSince(since) {
      const rows = await all('leer tus repasos de hoy', (from, to) =>
        client
          .from('review_log')
          .select('deck_id, queue_before')
          .not('rating', 'is', null)
          .gte('reviewed_at', since.toISOString())
          .order('id')
          .range(from, to),
      );
      return fromDatabase('review_log', AnswerTodayRows, rows).map((r) => ({
        deckId: r.deck_id,
        queueBefore: r.queue_before,
      }));
    },
  };
}
