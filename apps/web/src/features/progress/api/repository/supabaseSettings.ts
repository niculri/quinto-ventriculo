// The study adapter's settings: preferences, presets, each deck's preset and activation, and each assessment's
// options.
import { databaseError } from '@qv/schema/database';
import { STUDY_RPC, UserPreset } from '@qv/schema/user';
import { applyPreferencesPatch } from '@qv/study';
import { fromDatabase, toJson } from '../../../../shared/lib/json';
import { DATABASE_TIME_ZONE, defaultPreferences } from './model';
import type { StudyPreferences } from './model';
import type { StudyRepository } from './port';
import { iso, listOf } from './supabaseContext';
import type { StudyContext } from './supabaseContext';

const PresetConfig = UserPreset.shape.config;

type PreferenceAndPresets = Pick<
  StudyRepository,
  'preferences' | 'savePreferences' | 'presets' | 'savePreset' | 'deletePreset'
>;

export function preferencesAndPresets(ctx: StudyContext): PreferenceAndPresets {
  // `ctx.fail`, not destructured: only a call through the typed property narrows `data` after it.
  const { client } = ctx;
  const preset = (r: {
    id: string;
    name: string;
    replaces: string | null;
    config: unknown;
    updated_at: string;
  }) => ({
    id: r.id,
    name: r.name,
    replaces: r.replaces,
    config: fromDatabase('user_presets', PresetConfig, r.config),
    updatedAt: r.updated_at,
  });
  return {
    preferences: () => readPreferences(ctx),
    async savePreferences(patch) {
      const { data, error } = await client.rpc('save_study_preferences', { p: patch });
      if (!error) {
        return fromDatabase(
          'save_study_preferences',
          STUDY_RPC.save_study_preferences.returns,
          data,
        );
      }
      if (!databaseError(error).hasCode('PGRST202')) ctx.fail('guardar tus preferencias', error);
      // A users' database from before save_study_preferences(): the patch over what is stored, saved whole.
      const stored = await readPreferences(ctx);
      const next = applyPreferencesPatch(stored ?? defaultPreferences(DATABASE_TIME_ZONE), patch);
      await saveWhole(ctx, next);
      return next;
    },
    async presets() {
      const { data, error } = await client
        .from('user_presets')
        .select('id, name, replaces, config, updated_at')
        .order('created_at');
      if (error) ctx.fail('leer tus opciones', error);
      return data.map(preset);
    },
    async savePreset({ id, name, replaces, config }) {
      const row = { name, replaces, config: toJson(config), updated_at: new Date().toISOString() };
      const q = id
        ? client.from('user_presets').update(row).eq('id', id)
        : client.from('user_presets').insert(row);
      const { data, error } = await q.select('id, name, replaces, config, updated_at').single();
      if (error) ctx.fail('guardar las opciones', error);
      return preset(data);
    },
    async deletePreset(id) {
      const { error } = await client.from('user_presets').delete().eq('id', id);
      if (error) ctx.fail('eliminar la configuración', error);
    },
  };
}

type DeckSettings = Pick<
  StudyRepository,
  | 'deckSettings'
  | 'setDeckPreset'
  | 'deckActivations'
  | 'setDeckActivations'
  | 'assessmentSettings'
  | 'saveAssessmentSetting'
>;

export function deckSettings(ctx: StudyContext): DeckSettings {
  const { client } = ctx;
  return {
    async deckSettings() {
      const { data, error } = await client
        .from('deck_settings')
        .select('deck_id, preset_id, author_preset');
      if (error) ctx.fail('leer las opciones de tus mazos', error);
      return data.map((r) => ({
        deckId: r.deck_id,
        presetId: r.preset_id,
        authorPreset: r.author_preset,
      }));
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
      if (error) ctx.fail('cambiar la configuración del mazo', error);
    },
    async deckActivations() {
      const { data, error } = await client.from('deck_activations').select('deck_id, active');
      if (error) ctx.fail('leer qué tienes activado', error);
      return data.map((r) => ({
        deckId: r.deck_id,
        active: r.active,
      }));
    },
    async setDeckActivations(rows) {
      const at = new Date().toISOString();
      const { error } = await client.from('deck_activations').upsert(
        rows.map((r) => ({ deck_id: r.deckId, active: r.active, updated_at: at })),
        { onConflict: 'user_id,deck_id' },
      );
      if (error) ctx.fail('guardar qué tienes activado', error);
    },
    async assessmentSettings() {
      const { data, error } = await client
        .from('assessment_settings')
        .select(
          'deck_id, include_extras, new_per_day, exam_date, final_review_days, exam_date_set_at',
        );
      if (error) ctx.fail('leer las opciones de tus certámenes', error);
      return data.map((r) => ({
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
      if (error) ctx.fail('guardar las opciones del certamen', error);
    },
  };
}

async function readPreferences(ctx: StudyContext): Promise<StudyPreferences | null> {
  const { data, error } = await ctx.client.from('study_preferences').select('*').maybeSingle();
  if (error) ctx.fail('leer tus preferencias', error);
  if (!data) return null;
  const r = data;
  return {
    timeZone: r.time_zone,
    dayStartsAt: r.day_starts_at,
    learnAheadMinutes: r.learn_ahead_minutes,
    newCardsIgnoreReviewLimit: r.new_cards_ignore_review_limit,
    applyAllParentLimits: r.apply_all_parent_limits,
    fullAnki: r.full_anki,
    fourButtons: r.four_buttons,
    welcomeSeen: r.welcome_seen,
    // A users' database from before these columns does not send them.
    semester: r.semester ?? null,
    addedCourses: listOf(r.added_courses),
    removedCourses: listOf(r.removed_courses),
    dismissed: listOf(r.dismissed),
  };
}

async function saveWhole(ctx: StudyContext, p: StudyPreferences) {
  const { error } = await ctx.client.from('study_preferences').upsert(
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
  if (error) ctx.fail('guardar tus preferencias', error);
}
