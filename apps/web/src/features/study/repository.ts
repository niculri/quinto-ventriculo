// The user's study data (card states, review log, presets, preferences) in the RLS-protected users
// database, and a browser copy with the same rules for the demo and tests.

import type { SupabaseClient } from '@supabase/supabase-js';
import { dayOf, dayOfStart, retrievability } from '@qv/srs';
import { dayNumber, isoOfDay } from '../stats/heatmap';
import type { HeatmapData } from '../stats/heatmap';

type Phase = 'new' | 'learning' | 'review' | 'relearning';
export type QueueName = 'new' | 'learn' | 'day_learn' | 'review';

export interface CardKey {
  noteGuid: string;
  ord: number;
}

export interface CardRef extends CardKey {
  deckId: string;
}

export interface StoredCard extends CardRef {
  phase: Phase;
  /** Learning: `due` is a day (it passed the rollover). Reviews: always. */
  interday: boolean;
  remainingSteps: number;
  /** ISO time: the moment of a learning step today, or the start of the due day. */
  due: string | null;
  interval: number;
  stability: number | null;
  difficulty: number | null;
  reps: number;
  lapses: number;
  lastReview: string | null;
  flag: number;
  suspended: boolean;
  buriedUntil: string | null;
  leech: boolean;
  updatedAt: string;
  retiredAt?: string | null;
}

export type CardStateFields = Pick<
  StoredCard,
  | 'phase'
  | 'interday'
  | 'remainingSteps'
  | 'due'
  | 'interval'
  | 'stability'
  | 'difficulty'
  | 'reps'
  | 'lapses'
  | 'lastReview'
  | 'suspended'
  | 'leech'
>;

export interface StudyPreferences {
  timeZone: string;
  dayStartsAt: number;
  learnAheadMinutes: number;
  newCardsIgnoreReviewLimit: boolean;
  applyAllParentLimits: boolean;
  fullAnki: boolean;
  fourButtons: boolean;
  welcomeSeen: boolean;
  semester: number | null;
  addedCourses: string[];
  removedCourses: string[];
  dismissed: string[];
}

export function defaultPreferences(timeZone = browserTimeZone()): StudyPreferences {
  return {
    timeZone,
    dayStartsAt: 4,
    learnAheadMinutes: 20,
    newCardsIgnoreReviewLimit: false,
    applyAllParentLimits: false,
    fullAnki: false,
    fourButtons: false,
    welcomeSeen: false,
    semester: null,
    addedCourses: [],
    removedCourses: [],
    dismissed: [],
  };
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Santiago';
  } catch {
    return 'America/Santiago';
  }
}

export interface UserPreset {
  id: string;
  name: string;
  replaces: string | null;
  config: Record<string, unknown>;
  updatedAt: string;
}

export interface DeckSetting {
  deckId: string;
  presetId: string | null;
  authorPreset: string | null;
}

export interface DeckActivation {
  deckId: string;
  active: boolean;
}

export interface AssessmentSetting {
  deckId: string;
  includeExtras: boolean;
  newPerDay: number | null;
  examDate?: string | null;
  finalReviewDays?: number;
  examDateSetAt?: string | null;
}

export interface DeckProgress {
  deckId: string;
  seen: number;
  newSuspended: number;
  overdue: number;
  newToday: number;
  newYesterday: number;
}

// As `home_counts()` gives it, in Unix seconds: «l» a learning step of today (`due` is its moment), «d» learning past
// a day and «r» a review (`due` is the start of its day).
interface HomeDueCard {
  noteGuid: string;
  ord: number;
  queue: 'l' | 'd' | 'r';
  due: number;
}

export interface HomeDeckCounts {
  deckId: string;
  seen: number;
  hiddenNew: number;
  touched: number;
  suspended: number;
  recall: number;
  due: HomeDueCard[];
}

export interface HomeCounts {
  decks: HomeDeckCounts[];
  truncated: boolean;
}

export interface AnswerToday {
  deckId: string;
  queueBefore: QueueName;
}

export interface ReviewInput {
  card: CardRef;
  expectedUpdatedAt: string | null;
  rating: 1 | 2 | 3 | 4;
  queueBefore: QueueName;
  interval: number;
  lastInterval: number;
  durationMs: number;
  rBefore?: number | null;
  cardVersion?: number | null;
  state: CardStateFields;
  bury: CardRef[];
  buriedUntil: string | null;
}

export type ActionName =
  | 'answer'
  | 'bury_card'
  | 'bury_note'
  | 'suspend_card'
  | 'suspend_note'
  | 'flag'
  | 'unbury'
  | 'unsuspend'
  | 'forget';

export interface CardLogEntry {
  action: ActionName;
  reviewedAt: string;
  rating: number | null;
  queueBefore: QueueName | null;
  phaseBefore: Phase;
  phaseAfter: Phase;
  /** Days (positive) or seconds (negative), as Anki's revlog. */
  interval: number | null;
  stability: number | null;
  difficulty: number | null;
  durationMs: number | null;
}

export interface RatedAnswer {
  noteGuid: string;
  ord: number;
  rating: 1 | 2 | 3 | 4;
  reviewedAt: string;
}

interface UndoResult extends CardRef {
  action: ActionName;
  rating: number | null;
}

export interface CardChange {
  noteGuid: string;
  ord: number;
  deckId: string | null;
}

interface ReconcileResult {
  applied: boolean;
  syncedTo: number;
  changed: number;
}

export interface PracticeCount {
  deckId: string;
  n: number;
}

export const PRACTICE_BATCH_MAX = 1000;
export const PRACTICE_BATCH_DECKS = 100;
/** The database counts practice up to this a day and takes the rest without failing, so the final review goes on. */
export const PRACTICE_DAY_MAX = 5000;

/** The database refused a batch of practice (day's cap, too large, no longer invited): retrying would fail the same. */
export class PracticeRefusedError extends Error {}

export class CardChangedError extends Error {
  constructor() {
    super('Esta tarjeta cambió en otra pestaña o dispositivo.');
    this.name = 'CardChangedError';
  }
}

export interface StudyRepository {
  cards(deckIds: string[]): Promise<StoredCard[]>;
  allCards(): Promise<StoredCard[]>;
  cardLog(card: { noteGuid: string; ord: number }): Promise<CardLogEntry[]>;
  ratedSince(since: Date): Promise<RatedAnswer[]>;
  ratedBetween(from: Date, to: Date): Promise<(RatedAnswer & { deckId: string })[]>;
  firstAnswersSince(since: Date): Promise<{ noteGuid: string; ord: number; at: string }[]>;
  answersSince(since: Date): Promise<AnswerToday[]>;
  preferences(): Promise<StudyPreferences | null>;
  savePreferences(p: StudyPreferences): Promise<void>;
  presets(): Promise<UserPreset[]>;
  savePreset(p: {
    id?: string;
    name: string;
    replaces: string | null;
    config: Record<string, unknown>;
  }): Promise<UserPreset>;
  deletePreset(id: string): Promise<void>;
  deckSettings(): Promise<DeckSetting[]>;
  setDeckPreset(
    deckId: string,
    choice: { presetId: string } | { authorPreset: string } | null,
  ): Promise<void>;
  deckActivations(): Promise<DeckActivation[]>;
  setDeckActivation(deckId: string, active: boolean): Promise<void>;
  assessmentSettings(): Promise<AssessmentSetting[]>;
  saveAssessmentSetting(setting: AssessmentSetting): Promise<void>;
  answeredDecks(): Promise<string[]>;
  medianAnswerMs(): Promise<number | null>;
  deckProgress(dayStart: Date): Promise<DeckProgress[]>;
  recordReview(input: ReviewInput): Promise<{ updatedAt: string }>;
  bury(cards: CardRef[], until: Date, note: boolean): Promise<void>;
  suspend(cards: CardRef[], note: boolean): Promise<void>;
  setFlag(card: CardRef, flag: number): Promise<void>;
  setFlags(cards: CardRef[], flag: number): Promise<void>;
  unsuspend(cards: CardRef[]): Promise<void>;
  unbury(cards: CardRef[]): Promise<void>;
  forget(cards: CardRef[], resetCounts: boolean): Promise<void>;
  undo(): Promise<UndoResult | null>;
  heatmap(deckIds: string[] | null): Promise<HeatmapData>;
  recordPractice(counts: PracticeCount[]): Promise<void>;
  homeCounts(deckIds: string[], until: Date, decay: Record<string, number>): Promise<HomeCounts>;
  cardsSyncedTo(): Promise<number>;
  reconcileCards(input: {
    since: number;
    upTo: number;
    changes: CardChange[];
  }): Promise<ReconcileResult>;
}

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
const MIN_ANSWERS_FOR_MEDIAN = 20;

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

interface LogRow extends CardRef {
  id: number;
  actionId: string;
  action: ActionName;
  reviewedAt: string;
  rating: number | null;
  queueBefore: QueueName | null;
  before: StoredCard | null;
  after: StoredCard;
}

interface LocalData {
  cards: StoredCard[];
  log: LogRow[];
  presets: UserPreset[];
  settings: DeckSetting[];
  preferences: StudyPreferences | null;
  activations: DeckActivation[];
  assessments: AssessmentSetting[];
  durations: number[];
  syncedTo?: number;
  practice?: { day: string; deckId: string; n: number }[];
}

const empty = (): LocalData => ({
  cards: [],
  log: [],
  presets: [],
  settings: [],
  preferences: null,
  activations: [],
  assessments: [],
  durations: [],
});

export function localStudyRepository(
  storage: Storage | null = safeLocalStorage(),
  preferences?: Partial<StudyPreferences>,
): StudyRepository {
  const KEY = 'qv-demo-study';
  let memory: LocalData = {
    ...empty(),
    preferences: preferences ? { ...defaultPreferences(), ...preferences } : null,
  };
  const read = (): LocalData => {
    // A copy, as the database would give: what was read does not change under whoever holds it.
    if (!storage) return structuredClone(memory);
    try {
      return { ...empty(), ...(JSON.parse(storage.getItem(KEY) ?? 'null') as LocalData | null) };
    } catch {
      return empty();
    }
  };
  const write = (d: LocalData) => {
    memory = d;
    try {
      storage?.setItem(KEY, JSON.stringify(d));
    } catch {
      // full or blocked storage: it stays in memory for this visit
    }
  };
  // A moment strictly later than the last one written (two changes in the same millisecond are not equal).
  let lastStamp = 0;
  const stamp = () => {
    lastStamp = Math.max(Date.now(), lastStamp + 1);
    return new Date(lastStamp).toISOString();
  };
  const same = (a: CardKey, b: CardKey) => a.noteGuid === b.noteGuid && a.ord === b.ord;
  const blank = (ref: CardRef): StoredCard => ({
    ...ref,
    phase: 'new',
    interday: false,
    remainingSteps: 0,
    due: null,
    interval: 0,
    stability: null,
    difficulty: null,
    reps: 0,
    lapses: 0,
    lastReview: null,
    flag: 0,
    suspended: false,
    buriedUntil: null,
    leech: false,
    updatedAt: '',
  });
  let nextId = 1;
  const uuid = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;

  function change(
    d: LocalData,
    actionId: string,
    action: ActionName,
    ref: CardRef,
    at: string,
    patch: Partial<StoredCard>,
    row?: Partial<LogRow>,
  ): boolean {
    const i = d.cards.findIndex((c) => same(c, ref));
    const before = i >= 0 ? d.cards[i]! : null;
    // Anki does not bury a suspended card (burying: a time; unburying passes).
    if (patch.buriedUntil && before?.suspended) return false;
    const base = before ?? blank(ref);
    const after: StoredCard = {
      ...base,
      ...patch,
      deckId: before?.deckId ?? ref.deckId,
      ...('suspended' in patch && !('buriedUntil' in patch) ? { buriedUntil: null } : {}),
      updatedAt: stamp(),
    };
    if (i >= 0) d.cards[i] = after;
    else d.cards.push(after);
    nextId = Math.max(nextId, ...d.log.map((l) => l.id + 1));
    d.log.push({
      id: nextId++,
      actionId,
      action,
      noteGuid: ref.noteGuid,
      ord: ref.ord,
      deckId: ref.deckId,
      reviewedAt: at,
      rating: null,
      queueBefore: null,
      before,
      after,
      ...row,
    });
    return true;
  }

  function browseChange(
    d: LocalData,
    actionId: string,
    action: ActionName,
    ref: CardRef,
    patch: Partial<StoredCard>,
  ) {
    const before = d.cards.find((c) => same(c, ref));
    if (!before) return;
    const next = { ...before, ...patch };
    if (
      JSON.stringify({ ...next, updatedAt: '' }) === JSON.stringify({ ...before, updatedAt: '' })
    ) {
      return;
    }
    change(d, actionId, action, ref, new Date().toISOString(), patch);
  }

  return {
    async cards(deckIds) {
      const ids = new Set(deckIds);
      return read().cards.filter((c) => ids.has(c.deckId));
    },
    async allCards() {
      return read().cards;
    },
    async cardLog(card) {
      return read()
        .log.filter((l) => same(l, card))
        .map((l) => ({
          action: l.action,
          reviewedAt: l.reviewedAt,
          rating: l.rating,
          queueBefore: l.queueBefore,
          phaseBefore: l.before?.phase ?? 'new',
          phaseAfter: l.after.phase,
          interval: l.rating === null ? null : l.after.interval,
          stability: l.after.stability,
          difficulty: l.after.difficulty,
          durationMs: null,
        }));
    },
    async ratedSince(since) {
      return read()
        .log.filter((l) => l.rating !== null && Date.parse(l.reviewedAt) >= since.getTime())
        .map((l) => ({
          noteGuid: l.noteGuid,
          ord: l.ord,
          rating: l.rating as 1 | 2 | 3 | 4,
          reviewedAt: l.reviewedAt,
        }));
    },
    async ratedBetween(from, to) {
      return read()
        .log.filter((l) => {
          const at = Date.parse(l.reviewedAt);
          return l.rating !== null && at >= from.getTime() && at < to.getTime();
        })
        .map((l) => ({
          noteGuid: l.noteGuid,
          ord: l.ord,
          deckId: l.deckId,
          rating: l.rating as 1 | 2 | 3 | 4,
          reviewedAt: l.reviewedAt,
        }));
    },
    async firstAnswersSince(since) {
      const first = new Map<string, LogRow>();
      for (const l of read().log) {
        if (l.rating === null) continue;
        const k = `${l.noteGuid}\u001f${l.ord}`;
        if (!first.has(k)) first.set(k, l);
      }
      return [...first.values()]
        .filter((l) => Date.parse(l.reviewedAt) >= since.getTime())
        .map((l) => ({ noteGuid: l.noteGuid, ord: l.ord, at: l.reviewedAt }));
    },
    async answersSince(since) {
      return read()
        .log.filter((l) => l.rating !== null && Date.parse(l.reviewedAt) >= since.getTime())
        .map((l) => ({ deckId: l.deckId, queueBefore: l.queueBefore! }));
    },
    async preferences() {
      const saved = read().preferences;
      return saved ? { ...defaultPreferences(saved.timeZone), ...saved } : null;
    },
    async savePreferences(p) {
      write({ ...read(), preferences: p });
    },
    async presets() {
      return read().presets;
    },
    async savePreset({ id, name, replaces, config }) {
      const d = read();
      if (!id && replaces && d.presets.some((p) => p.replaces === replaces)) {
        throw new Error('No se pudo guardar las opciones: ya existe.');
      }
      const preset: UserPreset = { id: id ?? uuid(), name, replaces, config, updatedAt: stamp() };
      write({ ...d, presets: [...d.presets.filter((p) => p.id !== preset.id), preset] });
      return preset;
    },
    async deletePreset(id) {
      const d = read();
      write({
        ...d,
        presets: d.presets.filter((p) => p.id !== id),
        settings: d.settings.filter((s) => s.presetId !== id),
      });
    },
    async deckSettings() {
      return read().settings;
    },
    async setDeckPreset(deckId, choice) {
      const d = read();
      const rest = d.settings.filter((s) => s.deckId !== deckId);
      write({
        ...d,
        settings: choice
          ? [
              ...rest,
              {
                deckId,
                presetId: 'presetId' in choice ? choice.presetId : null,
                authorPreset: 'authorPreset' in choice ? choice.authorPreset : null,
              },
            ]
          : rest,
      });
    },
    async deckActivations() {
      return read().activations;
    },
    async setDeckActivation(deckId, active) {
      const d = read();
      write({
        ...d,
        activations: [...d.activations.filter((a) => a.deckId !== deckId), { deckId, active }],
      });
    },
    async assessmentSettings() {
      return read().assessments;
    },
    async saveAssessmentSetting(setting) {
      const d = read();
      write({
        ...d,
        assessments: [...d.assessments.filter((a) => a.deckId !== setting.deckId), setting],
      });
    },
    async deckProgress(dayStart) {
      const d = read();
      const start = dayStart.getTime();
      const halfDay = 43_200_000;
      const out = new Map<string, DeckProgress>();
      const of = (deckId: string) => {
        let p = out.get(deckId);
        if (!p) {
          p = { deckId, seen: 0, newSuspended: 0, overdue: 0, newToday: 0, newYesterday: 0 };
          out.set(deckId, p);
        }
        return p;
      };
      for (const c of d.cards) {
        if (c.retiredAt) continue;
        const p = of(c.deckId);
        if (c.phase === 'new') {
          if (c.suspended) p.newSuspended++;
          continue;
        }
        p.seen++;
        const buried = c.buriedUntil !== null && Date.parse(c.buriedUntil) >= start - halfDay;
        if (
          c.interday &&
          !c.suspended &&
          !buried &&
          c.due !== null &&
          Date.parse(c.due) < start - halfDay
        ) {
          p.overdue++;
        }
      }
      for (const l of d.log) {
        if (l.rating === null || l.queueBefore !== 'new') continue;
        const at = Date.parse(l.reviewedAt);
        if (at >= start) of(l.deckId).newToday++;
        else if (at >= start - 86_400_000) of(l.deckId).newYesterday++;
      }
      return [...out.values()];
    },
    async answeredDecks() {
      const answered = read().cards.filter(
        (c) => (c.phase !== 'new' || c.reps > 0) && !c.retiredAt,
      );
      return [...new Set(answered.map((c) => c.deckId))];
    },
    async medianAnswerMs() {
      const recent = read().durations.slice(-500);
      if (recent.length < MIN_ANSWERS_FOR_MEDIAN) return null;
      const sorted = [...recent].sort((a, b) => a - b);
      const mid = (sorted.length - 1) / 2;
      return Math.round((sorted[Math.floor(mid)]! + sorted[Math.ceil(mid)]!) / 2);
    },
    async heatmap(deckIds) {
      const d = read();
      const prefs = { ...defaultPreferences(), ...d.preferences };
      const only = deckIds === null ? null : new Set(deckIds);
      const nowSecs = Date.now() / 1000;
      const today = dayOf(nowSecs, prefs.timeZone, prefs.dayStartsAt);
      const days = new Map<
        string,
        { day: number; deckId: string; answers: number; practice: number }
      >();
      const add = (day: number, deckId: string, answers: number, practice: number) => {
        if (only && !only.has(deckId)) return;
        const key = `${day}:${deckId}`;
        const row = days.get(key) ?? { day, deckId, answers: 0, practice: 0 };
        row.answers += answers;
        row.practice += practice;
        days.set(key, row);
      };
      for (const l of d.log) {
        if (l.rating === null) continue;
        add(
          dayOf(Date.parse(l.reviewedAt) / 1000, prefs.timeZone, prefs.dayStartsAt),
          l.deckId,
          1,
          0,
        );
      }
      for (const p of d.practice ?? []) add(dayNumber(p.day), p.deckId, 0, p.n);
      const due = new Map<number, number>();
      for (const c of d.cards) {
        if (only && !only.has(c.deckId)) continue;
        if (!c.interday || c.phase === 'new' || c.due === null || c.suspended || c.retiredAt)
          continue;
        if (c.buriedUntil !== null && Date.parse(c.buriedUntil) > Date.now()) continue;
        const day = dayOfStart(Date.parse(c.due) / 1000, prefs.timeZone, prefs.dayStartsAt);
        if (day >= today) due.set(day, (due.get(day) ?? 0) + 1);
      }
      return {
        days: [...days.values()].sort((a, b) => a.day - b.day || a.deckId.localeCompare(b.deckId)),
        due: [...due].sort((a, b) => a[0] - b[0]).map(([day, cards]) => ({ day, cards })),
      };
    },
    async recordPractice(counts) {
      const decks = counts.filter((c) => c.n > 0);
      if (!decks.length) return;
      if (
        decks.length > PRACTICE_BATCH_DECKS ||
        decks.reduce((t, c) => t + c.n, 0) > PRACTICE_BATCH_MAX
      ) {
        throw new PracticeRefusedError('No se pudo guardar tu repaso: too_large');
      }
      const d = read();
      const prefs = { ...defaultPreferences(), ...d.preferences };
      const day = isoOfDay(dayOf(Date.now() / 1000, prefs.timeZone, prefs.dayStartsAt));
      const practice = [...(d.practice ?? [])];
      let room = PRACTICE_DAY_MAX - practice.reduce((t, p) => t + (p.day === day ? p.n : 0), 0);
      for (const c of decks) {
        const n = Math.min(c.n, Math.max(0, room));
        if (n === 0) break;
        room -= n;
        const i = practice.findIndex((p) => p.day === day && p.deckId === c.deckId);
        if (i >= 0) practice[i] = { ...practice[i]!, n: practice[i]!.n + n };
        else practice.push({ day, deckId: c.deckId, n });
      }
      write({ ...d, practice });
    },
    async recordReview(input) {
      const d = read();
      const current = d.cards.find((c) => same(c, input.card)) ?? null;
      if ((current?.updatedAt ?? null) !== input.expectedUpdatedAt) throw new CardChangedError();
      const actionId = uuid();
      const at = input.state.lastReview ?? new Date().toISOString();
      change(
        d,
        actionId,
        'answer',
        input.card,
        at,
        {
          ...input.state,
          suspended: (current?.suspended ?? false) || input.state.suspended,
          leech: (current?.leech ?? false) || input.state.leech,
        },
        { rating: input.rating, queueBefore: input.queueBefore },
      );
      for (const sibling of input.bury) {
        change(d, actionId, 'answer', sibling, at, { buriedUntil: input.buriedUntil });
      }
      d.durations.push(input.durationMs);
      write(d);
      return { updatedAt: d.cards.find((c) => same(c, input.card))!.updatedAt };
    },
    async bury(cards, until, note) {
      const d = read();
      const actionId = uuid();
      for (const c of cards) {
        change(d, actionId, note ? 'bury_note' : 'bury_card', c, new Date().toISOString(), {
          buriedUntil: until.toISOString(),
        });
      }
      write(d);
    },
    async suspend(cards, note) {
      const d = read();
      const actionId = uuid();
      for (const c of cards) {
        change(d, actionId, note ? 'suspend_note' : 'suspend_card', c, new Date().toISOString(), {
          suspended: true,
        });
      }
      write(d);
    },
    async setFlag(card, flag) {
      const d = read();
      change(d, uuid(), 'flag', card, new Date().toISOString(), { flag });
      write(d);
    },
    async setFlags(cards, flag) {
      const d = read();
      const actionId = uuid();
      for (const c of cards) {
        if ((d.cards.find((x) => same(x, c))?.flag ?? 0) === flag) continue;
        change(d, actionId, 'flag', c, new Date().toISOString(), { flag });
      }
      write(d);
    },
    async unsuspend(cards) {
      const d = read();
      const actionId = uuid();
      for (const c of cards) browseChange(d, actionId, 'unsuspend', c, { suspended: false });
      write(d);
    },
    async unbury(cards) {
      const d = read();
      const actionId = uuid();
      for (const c of cards) browseChange(d, actionId, 'unbury', c, { buriedUntil: null });
      write(d);
    },
    async forget(cards, resetCounts) {
      const d = read();
      const actionId = uuid();
      for (const c of cards) {
        browseChange(d, actionId, 'forget', c, {
          phase: 'new',
          interday: false,
          remainingSteps: 0,
          due: null,
          interval: 0,
          stability: null,
          difficulty: null,
          lastReview: null,
          suspended: false,
          buriedUntil: null,
          ...(resetCounts ? { reps: 0, lapses: 0 } : {}),
        });
      }
      write(d);
    },
    async undo() {
      const d = read();
      const last = d.log.at(-1);
      if (!last) return null;
      const rows = d.log.filter((l) => l.actionId === last.actionId);
      for (const row of [...rows].reverse()) {
        const i = d.cards.findIndex((c) => same(c, row));
        if (row.before === null) {
          if (i >= 0) d.cards.splice(i, 1);
        } else if (i >= 0) {
          const now = d.cards[i]!;
          d.cards[i] = { ...row.before, deckId: now.deckId, retiredAt: now.retiredAt ?? null };
        } else d.cards.push(row.before);
      }
      const main = rows[0]!;
      write({ ...d, log: d.log.filter((l) => l.actionId !== last.actionId) });
      return {
        action: main.action,
        noteGuid: main.noteGuid,
        ord: main.ord,
        deckId: main.deckId,
        rating: main.rating,
      };
    },
    async homeCounts(deckIds, until, decay) {
      const wanted = new Set(deckIds);
      const nowMs = Date.now();
      const hidden = (c: StoredCard) =>
        c.suspended || (c.buriedUntil !== null && Date.parse(c.buriedUntil) > nowMs);
      const out = new Map<string, HomeDeckCounts & { notes: Set<string> }>();
      for (const c of read().cards) {
        if (!wanted.has(c.deckId) || c.retiredAt) continue;
        let deck = out.get(c.deckId);
        if (!deck) {
          deck = {
            deckId: c.deckId,
            seen: 0,
            hiddenNew: 0,
            touched: 0,
            suspended: 0,
            recall: 0,
            due: [],
            notes: new Set(),
          };
          out.set(c.deckId, deck);
        }
        deck.notes.add(c.noteGuid);
        if (c.suspended) deck.suspended++;
        if (c.phase === 'new') {
          if (hidden(c)) deck.hiddenNew++;
          continue;
        }
        deck.seen++;
        if (!c.suspended && c.stability !== null && c.lastReview !== null) {
          const days = Math.max(0, nowMs - Date.parse(c.lastReview)) / 86_400_000;
          deck.recall += retrievability(
            [...Array<number>(20).fill(0), decay[c.deckId] ?? 0.5],
            { stability: c.stability, difficulty: c.difficulty ?? 5 },
            days,
          );
        }
        if (c.due === null || hidden(c) || (c.interday && Date.parse(c.due) >= until.getTime())) {
          continue;
        }
        deck.due.push({
          noteGuid: c.noteGuid,
          ord: c.ord,
          queue: c.phase === 'review' ? 'r' : c.interday ? 'd' : 'l',
          due: Math.floor(Date.parse(c.due) / 1000),
        });
      }
      return {
        truncated: false,
        decks: [...out.values()]
          .sort((a, b) => (a.deckId < b.deckId ? -1 : a.deckId > b.deckId ? 1 : 0))
          .map(({ notes, ...d }) => ({
            ...d,
            touched: notes.size,
            due: d.due.sort((a, b) =>
              a.noteGuid < b.noteGuid ? -1 : a.noteGuid > b.noteGuid ? 1 : a.ord - b.ord,
            ),
          })),
      };
    },
    async cardsSyncedTo() {
      return read().syncedTo ?? 0;
    },
    async reconcileCards({ since, upTo, changes }) {
      const d = read();
      if ((d.syncedTo ?? 0) !== since) {
        return { applied: false, syncedTo: d.syncedTo ?? 0, changed: 0 };
      }
      let changed = 0;
      for (const c of changes) {
        const i = d.cards.findIndex((x) => same(x, c));
        if (i < 0) continue;
        const row = d.cards[i]!;
        const deckId = c.deckId ?? row.deckId;
        const retiredAt = c.deckId === null ? (row.retiredAt ?? new Date().toISOString()) : null;
        if (deckId === row.deckId && !!retiredAt === !!row.retiredAt) continue;
        d.cards[i] = { ...row, deckId, retiredAt };
        changed++;
      }
      write({ ...d, syncedTo: upTo });
      return { applied: true, syncedTo: upTo, changed };
    },
  };
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
