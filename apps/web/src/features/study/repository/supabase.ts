// The user's study data (card states, review log, presets, preferences) in the RLS-protected users database.
import type { SupabaseClient } from '@supabase/supabase-js';
import { dayNumber } from '../../stats/heatmap';
import type { StudyRepository } from './port';
import { CardChangedError, PracticeRefusedError } from './model';
import type {
  ActionName,
  CardRef,
  HomeCounts,
  HomeDueCard,
  Phase,
  QueueName,
  ReconcileResult,
  StoredCard,
  UndoResult,
} from './model';

interface CardRow {
  note_guid: string;
  ord: number;
  deck_id: string;
  phase: Phase;
  interday: boolean;
  remaining_steps: number;
  due: string | null;
  interval: number;
  stability: number | null;
  difficulty: number | null;
  reps: number;
  lapses: number;
  last_review: string | null;
  flag: number;
  suspended: boolean;
  buried_until: string | null;
  leech: boolean;
  updated_at: string;
  retired_at?: string | null;
}

const iso = (t: string | null) => (t === null ? null : new Date(t).toISOString());

function fromRow(r: CardRow): StoredCard {
  return {
    noteGuid: r.note_guid,
    ord: r.ord,
    deckId: r.deck_id,
    phase: r.phase,
    interday: r.interday,
    remainingSteps: r.remaining_steps,
    due: iso(r.due),
    interval: r.interval,
    stability: r.stability,
    difficulty: r.difficulty,
    reps: r.reps,
    lapses: r.lapses,
    lastReview: iso(r.last_review),
    flag: r.flag,
    suspended: r.suspended,
    buriedUntil: iso(r.buried_until),
    leech: r.leech,
    // Kept as the database wrote it: the answer sends it back to check nobody changed the card.
    updatedAt: r.updated_at,
    retiredAt: iso(r.retired_at ?? null),
  };
}

function homeCountsFromJson(data: unknown): HomeCounts {
  const raw = (data ?? {}) as {
    decks?: [string, number, number, number, number, number, [string, number, string, number][]][];
    truncated?: boolean;
  };
  return {
    truncated: !!raw.truncated,
    decks: (raw.decks ?? []).map(([deckId, seen, hiddenNew, touched, suspended, recall, due]) => ({
      deckId,
      seen,
      hiddenNew,
      touched,
      suspended,
      recall,
      due: (due ?? []).map(([noteGuid, ord, queue, at]) => ({
        noteGuid,
        ord,
        queue: queue as HomeDueCard['queue'],
        due: at,
      })),
    })),
  };
}

const PAGE = 1000;
export const CARDS_OF_DECKS_MAX = 5000;

export function supabaseStudyRepository(client: SupabaseClient): StudyRepository {
  const fail = (what: string, e: { message: string; details?: string | null }): never => {
    if (/quota_exceeded/.test(e.message)) {
      throw new Error(
        e.details === 'changes'
          ? `No se pudo ${what}: llegaste al máximo de cambios de un día. Sigue mañana.`
          : `No se pudo ${what}: llegaste al máximo que se puede guardar.`,
      );
    }
    throw new Error(`No se pudo ${what}: ${e.message}`);
  };
  const refs = (cards: CardRef[]) =>
    cards.map((c) => ({ noteGuid: c.noteGuid, ord: c.ord, deckId: c.deckId }));
  // Each write sends up to which content change this page has its cards' decks (x-card-sync): if another tab is ahead,
  // the database marks the rows it creates to be reconciled again.
  let seenTo: number | null = null;
  const write = (fn: string, args: Record<string, unknown>) => {
    const call = client.rpc(fn, args);
    return seenTo === null ? call : call.setHeader('x-card-sync', String(seenTo));
  };

  async function all<T>(
    what: string,
    page: (
      from: number,
      to: number,
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  ): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await page(from, from + PAGE - 1);
      if (error) fail(what, error);
      const rows = (data ?? []) as T[];
      out.push(...rows);
      if (rows.length < PAGE) return out;
    }
  }

  const chunks = <T>(list: T[], size = 60) =>
    Array.from({ length: Math.ceil(list.length / size) }, (_, i) =>
      list.slice(i * size, i * size + size),
    );

  return {
    // The decks of an assessment or a course in one call (card_states_of_decks()), only the student's rows of them.
    // A users' database from before that function does not have it: then a page at a time.
    async cards(deckIds) {
      if (!deckIds.length) return [];
      const paged = async (ids: string[]) =>
        all<CardRow>('leer tu avance en el mazo', (from, to) =>
          client
            .from('card_states')
            .select('*')
            .in('deck_id', ids)
            .order('note_guid')
            .order('ord')
            .range(from, to),
        );
      const parts = await Promise.all(
        chunks(deckIds, CARDS_OF_DECKS_MAX).map(async (ids) => {
          const { data, error } = await client.rpc('card_states_of_decks', { p_deck_ids: ids });
          if (!error) return (data ?? []) as CardRow[];
          if (error.code === 'PGRST202') {
            return (await Promise.all(chunks(ids).map(paged))).flat();
          }
          return fail('leer tu avance en el mazo', error);
        }),
      );
      return parts.flat().map(fromRow);
    },
    async allCards() {
      const rows = await all<CardRow>('leer tu avance', (from, to) =>
        client.from('card_states').select('*').order('note_guid').order('ord').range(from, to),
      );
      return rows.map(fromRow);
    },
    async cardLog(card) {
      const rows = await all<{
        action: ActionName;
        reviewed_at: string;
        rating: number | null;
        queue_before: QueueName | null;
        phase_before: Phase;
        phase_after: Phase;
        interval: number | null;
        stability_after: number | null;
        difficulty_after: number | null;
        duration_ms: number | null;
      }>('leer el historial de la tarjeta', (from, to) =>
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
      return rows.map((r) => ({
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
    async ratedSince(since) {
      const rows = await all<{
        note_guid: string;
        ord: number;
        rating: 1 | 2 | 3 | 4;
        reviewed_at: string;
      }>('leer tus repasos', (from, to) =>
        client
          .from('review_log')
          .select('note_guid, ord, rating, reviewed_at')
          .not('rating', 'is', null)
          .gte('reviewed_at', since.toISOString())
          .order('id')
          .range(from, to),
      );
      return rows.map((r) => ({
        noteGuid: r.note_guid,
        ord: r.ord,
        rating: r.rating,
        reviewedAt: new Date(r.reviewed_at).toISOString(),
      }));
    },
    async ratedBetween(from, to) {
      const rows = await all<{
        note_guid: string;
        ord: number;
        deck_id: string;
        rating: 1 | 2 | 3 | 4;
        reviewed_at: string;
      }>('leer tus repasos de ese día', (start, end) =>
        client
          .from('review_log')
          .select('note_guid, ord, deck_id, rating, reviewed_at')
          .not('rating', 'is', null)
          .gte('reviewed_at', from.toISOString())
          .lt('reviewed_at', to.toISOString())
          .order('id')
          .range(start, end),
      );
      return rows.map((r) => ({
        noteGuid: r.note_guid,
        ord: r.ord,
        deckId: r.deck_id,
        rating: r.rating,
        reviewedAt: new Date(r.reviewed_at).toISOString(),
      }));
    },
    async firstAnswersSince(since) {
      const rows = await all<{ note_guid: string; ord: number; first_at: string }>(
        'leer tus tarjetas introducidas',
        (from, to) =>
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
      const rows = await all<{ deck_id: string; queue_before: QueueName }>(
        'leer tus repasos de hoy',
        (from, to) =>
          client
            .from('review_log')
            .select('deck_id, queue_before')
            .not('rating', 'is', null)
            .gte('reviewed_at', since.toISOString())
            .order('id')
            .range(from, to),
      );
      return rows.map((r) => ({ deckId: r.deck_id, queueBefore: r.queue_before }));
    },
    async preferences() {
      const { data, error } = await client.from('study_preferences').select('*').maybeSingle();
      if (error) fail('leer tus preferencias', error);
      if (!data) return null;
      const r = data as Record<string, unknown>;
      return {
        timeZone: r['time_zone'] as string,
        dayStartsAt: r['day_starts_at'] as number,
        learnAheadMinutes: r['learn_ahead_minutes'] as number,
        newCardsIgnoreReviewLimit: r['new_cards_ignore_review_limit'] as boolean,
        applyAllParentLimits: r['apply_all_parent_limits'] as boolean,
        fullAnki: r['full_anki'] as boolean,
        fourButtons: r['four_buttons'] as boolean,
        welcomeSeen: r['welcome_seen'] as boolean,
        semester: (r['semester'] as number | null | undefined) ?? null,
        addedCourses: (r['added_courses'] as string[] | null | undefined) ?? [],
        removedCourses: (r['removed_courses'] as string[] | null | undefined) ?? [],
        dismissed: (r['dismissed'] as string[] | null | undefined) ?? [],
      };
    },
    async savePreferences(p) {
      const { error } = await client.from('study_preferences').upsert(
        {
          time_zone: p.timeZone,
          day_starts_at: p.dayStartsAt,
          learn_ahead_minutes: p.learnAheadMinutes,
          new_cards_ignore_review_limit: p.newCardsIgnoreReviewLimit,
          apply_all_parent_limits: p.applyAllParentLimits,
          full_anki: p.fullAnki,
          four_buttons: p.fourButtons,
          welcome_seen: p.welcomeSeen,
          semester: p.semester,
          added_courses: p.addedCourses,
          removed_courses: p.removedCourses,
          dismissed: p.dismissed,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
      if (error) fail('guardar tus preferencias', error);
    },
    async presets() {
      const { data, error } = await client
        .from('user_presets')
        .select('id, name, replaces, config, updated_at')
        .order('created_at');
      if (error) fail('leer tus opciones', error);
      return (
        data as {
          id: string;
          name: string;
          replaces: string | null;
          config: Record<string, unknown>;
          updated_at: string;
        }[]
      ).map((r) => ({
        id: r.id,
        name: r.name,
        replaces: r.replaces,
        config: r.config,
        updatedAt: r.updated_at,
      }));
    },
    async savePreset({ id, name, replaces, config }) {
      const row = { name, replaces, config, updated_at: new Date().toISOString() };
      const q = id
        ? client.from('user_presets').update(row).eq('id', id)
        : client.from('user_presets').insert(row);
      const { data, error } = await q.select('id, name, replaces, config, updated_at').single();
      if (error) fail('guardar las opciones', error);
      const r = data as {
        id: string;
        name: string;
        replaces: string | null;
        config: Record<string, unknown>;
        updated_at: string;
      };
      return {
        id: r.id,
        name: r.name,
        replaces: r.replaces,
        config: r.config,
        updatedAt: r.updated_at,
      };
    },
    async deletePreset(id) {
      const { error } = await client.from('user_presets').delete().eq('id', id);
      if (error) fail('eliminar la configuración', error);
    },
    async deckSettings() {
      const { data, error } = await client
        .from('deck_settings')
        .select('deck_id, preset_id, author_preset');
      if (error) fail('leer las opciones de tus mazos', error);
      return (
        data as { deck_id: string; preset_id: string | null; author_preset: string | null }[]
      ).map((r) => ({ deckId: r.deck_id, presetId: r.preset_id, authorPreset: r.author_preset }));
    },
    async setDeckPreset(deckId, choice) {
      const { error } = choice
        ? await client.from('deck_settings').upsert(
            {
              deck_id: deckId,
              preset_id: 'presetId' in choice ? choice.presetId : null,
              author_preset: 'authorPreset' in choice ? choice.authorPreset : null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,deck_id' },
          )
        : await client.from('deck_settings').delete().eq('deck_id', deckId);
      if (error) fail('cambiar la configuración del mazo', error);
    },
    async deckActivations() {
      const { data, error } = await client.from('deck_activations').select('deck_id, active');
      if (error) fail('leer qué tienes activado', error);
      return (data as { deck_id: string; active: boolean }[]).map((r) => ({
        deckId: r.deck_id,
        active: r.active,
      }));
    },
    async setDeckActivation(deckId, active) {
      const { error } = await client
        .from('deck_activations')
        .upsert(
          { deck_id: deckId, active, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,deck_id' },
        );
      if (error) fail('guardar qué tienes activado', error);
    },
    async assessmentSettings() {
      const { data, error } = await client
        .from('assessment_settings')
        .select(
          'deck_id, include_extras, new_per_day, exam_date, final_review_days, exam_date_set_at',
        );
      if (error) fail('leer las opciones de tus certámenes', error);
      return (
        data as {
          deck_id: string;
          include_extras: boolean;
          new_per_day: number | null;
          exam_date: string | null;
          final_review_days: number;
          exam_date_set_at: string | null;
        }[]
      ).map((r) => ({
        deckId: r.deck_id,
        includeExtras: r.include_extras,
        newPerDay: r.new_per_day,
        examDate: r.exam_date,
        finalReviewDays: r.final_review_days,
        examDateSetAt: iso(r.exam_date_set_at),
      }));
    },
    async saveAssessmentSetting(setting) {
      const { error } = await client.from('assessment_settings').upsert(
        {
          deck_id: setting.deckId,
          include_extras: setting.includeExtras,
          new_per_day: setting.newPerDay,
          exam_date: setting.examDate ?? null,
          final_review_days: setting.finalReviewDays ?? 3,
          exam_date_set_at: setting.examDateSetAt ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,deck_id' },
      );
      if (error) fail('guardar las opciones del certamen', error);
    },
    async deckProgress(dayStart) {
      const rows = await all<{
        deck_id: string;
        seen: number;
        new_suspended: number;
        overdue: number;
        new_today: number;
        new_yesterday: number;
      }>('leer tu avance', (from, to) =>
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
      const rows = await all<{ deck_id: string }>('leer tus mazos estudiados', (from, to) =>
        client.rpc('answered_decks').order('deck_id').range(from, to),
      );
      return rows.map((r) => r.deck_id);
    },
    async medianAnswerMs() {
      const { data, error } = await client.rpc('median_answer_ms');
      if (error) fail('leer tu tiempo por tarjeta', error);
      return (data as number | null) ?? null;
    },
    async heatmap(deckIds) {
      const { data, error } = await client.rpc(
        'study_heatmap',
        deckIds === null ? {} : { p_deck_ids: deckIds },
      );
      if (error) fail('leer tus días de estudio', error);
      const raw = (data ?? {}) as {
        days?: [string, string, number, number][];
        due?: [string, number][];
      };
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
    async recordPractice(counts) {
      const decks = counts.filter((c) => c.n > 0);
      if (!decks.length) return;
      const { error } = await client.rpc('record_practice', { p: { decks } });
      if (error) {
        // not_allowed (42501), invalid or too large (22023), the day's cap (P0001): the answer, not the network.
        if (['42501', '22023', 'P0001'].includes((error as { code?: string }).code ?? '')) {
          throw new PracticeRefusedError(`No se pudo guardar tu repaso: ${error.message}`);
        }
        fail('guardar tu repaso', error);
      }
    },
    async recordReview(input) {
      const { data, error } = await write('record_review', {
        a: {
          ...refs([input.card])[0],
          expectedUpdatedAt: input.expectedUpdatedAt,
          rating: input.rating,
          queueBefore: input.queueBefore,
          interval: input.interval,
          lastInterval: input.lastInterval,
          durationMs: input.durationMs,
          rBefore: input.rBefore ?? null,
          cardVersion: input.cardVersion ?? null,
          state: input.state,
          bury: refs(input.bury),
          buriedUntil: input.buriedUntil,
        },
      });
      if (error) {
        if (/card_changed/.test(error.message)) throw new CardChangedError();
        fail('guardar tu respuesta', error);
      }
      return { updatedAt: (data as { updatedAt: string }).updatedAt };
    },
    async bury(cards, until, note) {
      const { error } = await write('bury_cards', {
        cards: refs(cards),
        until: until.toISOString(),
        note,
      });
      if (error) fail('enterrar', error);
    },
    async suspend(cards, note) {
      const { error } = await write('suspend_cards', { cards: refs(cards), note });
      if (error) fail('suspender', error);
    },
    async setFlag(card, flag) {
      const { error } = await write('set_flag', { card: refs([card])[0], flag });
      if (error) fail('marcar la tarjeta', error);
    },
    async setFlags(cards, flag) {
      const { error } = await write('set_flags', { cards: refs(cards), flag });
      if (error) fail('marcar las tarjetas', error);
    },
    async unsuspend(cards) {
      const { error } = await write('unsuspend_cards', { cards: refs(cards) });
      if (error) fail('quitar la suspensión', error);
    },
    async unbury(cards) {
      const { error } = await write('unbury_cards', { cards: refs(cards) });
      if (error) fail('desenterrar', error);
    },
    async forget(cards, resetCounts) {
      const { error } = await write('forget_cards', {
        cards: refs(cards),
        reset_counts: resetCounts,
      });
      if (error) fail('olvidar las tarjetas', error);
    },
    async undo() {
      const { data, error } = await write('undo_last_review', {});
      if (error) fail('deshacer', error);
      return (data as UndoResult | null) ?? null;
    },
    async cardsSyncedTo() {
      const { data, error } = await client
        .from('card_sync')
        .select('synced_to, repair_from')
        .maybeSingle();
      if (error) fail('leer tu avance', error);
      const row = data as {
        synced_to: number | string;
        repair_from: number | string | null;
      } | null;
      // Rows a page that was behind created: from there again (reconcile_cards() takes it as the cursor).
      const stored = Number(row?.repair_from ?? row?.synced_to ?? 0);
      seenTo = Number(row?.synced_to ?? 0);
      return stored;
    },
    async reconcileCards(input) {
      const { data, error } = await client.rpc('reconcile_cards', { p: input });
      if (error) fail('poner al día tus tarjetas', error);
      const r = data as ReconcileResult;
      if (r.applied) seenTo = Number(r.syncedTo);
      return { applied: r.applied, syncedTo: Number(r.syncedTo), changed: r.changed };
    },
  };
}
