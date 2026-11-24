// Tests the study adapter's settings: what each read and write says when the database refuses it, the defaults of a
// users' database from before some columns, and which request each choice makes.
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@qv/db-types/users';
import { describe, expect, it } from 'vitest';
import { supabaseStudyRepository } from '../';
import type { StudyRepository } from '../';
import {
  NO_AUTH,
  USERS_DB_KEY,
  USERS_DB_URL,
  refusal,
  usersDbFetch,
} from '../../../../../test/appFakes';
import type { UsersDbAnswer, UsersDbCall } from '../../../../../test/appFakes';
import { preferencesPatch } from '@qv/study';

function repo(answer: (call: UsersDbCall) => UsersDbAnswer | undefined = () => undefined) {
  const { fetch, calls } = usersDbFetch(answer);
  const client = createClient<Database>(USERS_DB_URL, USERS_DB_KEY, {
    ...NO_AUTH,
    global: { fetch },
  });
  return { study: supabaseStudyRepository(client), calls };
}

const PREFS = {
  timeZone: 'America/Santiago',
  dayStartsAt: 4,
  learnAheadMinutes: 20,
  newCardsIgnoreReviewLimit: false,
  applyAllParentLimits: false,
  fullAnki: false,
  fourButtons: false,
  welcomeSeen: true,
  semester: 2,
  addedCourses: [],
  removedCourses: [],
  dismissed: [],
};

const REFUSED: [string, (s: StudyRepository) => Promise<unknown>][] = [
  ['leer tus preferencias', (s) => s.preferences()],
  ['guardar tus preferencias', (s) => s.savePreferences(preferencesPatch(null, PREFS))],
  ['leer tus opciones', (s) => s.presets()],
  ['guardar las opciones', (s) => s.savePreset({ name: 'Mía', replaces: null, config: {} })],
  ['eliminar la configuración', (s) => s.deletePreset('p1')],
  ['leer las opciones de tus mazos', (s) => s.deckSettings()],
  ['cambiar la configuración del mazo', (s) => s.setDeckPreset('d1', null)],
  ['leer qué tienes activado', (s) => s.deckActivations()],
  ['guardar qué tienes activado', (s) => s.setDeckActivation('d1', true)],
  ['leer las opciones de tus certámenes', (s) => s.assessmentSettings()],
  [
    'guardar las opciones del certamen',
    (s) => s.saveAssessmentSetting({ deckId: 'd1', includeExtras: false, newPerDay: 20 }),
  ],
];

describe('a refused settings call', () => {
  it.each(REFUSED)('«No se pudo %s» with the database’s message', async (what, call) => {
    const { study } = repo(() => refusal('42501', 'permission denied'));
    await expect(call(study)).rejects.toThrow(`No se pudo ${what}: permission denied`);
  });
});

describe('the preferences', () => {
  it('a users’ database from before save_study_preferences(): the patch over what is stored, saved whole', async () => {
    const stored = {
      time_zone: 'America/Santiago',
      day_starts_at: 4,
      learn_ahead_minutes: 20,
      new_cards_ignore_review_limit: false,
      apply_all_parent_limits: false,
      full_anki: true,
      four_buttons: false,
      welcome_seen: true,
      semester: 2,
      added_courses: [],
      removed_courses: [],
      dismissed: ['tip-a'],
    };
    const old = (row: unknown[]) =>
      repo((c) => {
        if (c.rpc) return refusal('PGRST202', 'Could not find the function');
        return c.method === 'GET' ? { body: row } : { body: null };
      });
    const { study, calls } = old([stored]);
    const saved = await study.savePreferences({
      fourButtons: true,
      dismissed: { add: ['tip-b'], remove: [] },
    });
    expect(saved).toEqual({
      ...PREFS,
      fullAnki: true,
      fourButtons: true,
      dismissed: ['tip-a', 'tip-b'],
    });
    const upsert = calls.at(-1)!;
    expect([upsert.method, upsert.name, upsert.search.get('on_conflict')]).toEqual([
      'POST',
      'study_preferences',
      'user_id',
    ]);
    expect(upsert.body).toMatchObject({
      full_anki: true,
      four_buttons: true,
      dismissed: ['tip-a', 'tip-b'],
    });
    expect(await old([]).study.savePreferences({ fullAnki: true })).toMatchObject({
      timeZone: 'America/Santiago',
      fullAnki: true,
      welcomeSeen: false,
    });
  });

  it('a users’ database from before it that refuses the whole row says so', async () => {
    const { study } = repo((c) => {
      if (c.rpc) return refusal('PGRST202', 'Could not find the function');
      return c.method === 'GET' ? { body: [] } : refusal('42501', 'permission denied');
    });
    await expect(study.savePreferences({ fullAnki: true })).rejects.toThrow(
      'No se pudo guardar tus preferencias: permission denied',
    );
  });

  it('none without a row; the columns a users’ database from before them does not send read as empty', async () => {
    expect(await repo(() => ({ body: [] })).study.preferences()).toBeNull();
    const old = {
      time_zone: 'America/Santiago',
      day_starts_at: 4,
      learn_ahead_minutes: 20,
      new_cards_ignore_review_limit: false,
      apply_all_parent_limits: true,
      full_anki: true,
      four_buttons: false,
      welcome_seen: false,
    };
    expect(await repo(() => ({ body: [old] })).study.preferences()).toMatchObject({
      applyAllParentLimits: true,
      fullAnki: true,
      semester: null,
      addedCourses: [],
      removedCourses: [],
      dismissed: [],
    });
  });
});

describe('the deck’s preset', () => {
  it('no choice deletes the row; a preset of the student’s or of the author’s fills only its column', async () => {
    const { study, calls } = repo();
    await study.setDeckPreset('d1', null);
    await study.setDeckPreset('d1', { presetId: 'p1' });
    await study.setDeckPreset('d1', { authorPreset: 'a1' });
    expect(calls.map((c) => [c.method, c.search.get('deck_id')])).toEqual([
      ['DELETE', 'eq.d1'],
      ['POST', null],
      ['POST', null],
    ]);
    expect(calls[1]!.body).toMatchObject({ deck_id: 'd1', preset_id: 'p1', author_preset: null });
    expect(calls[2]!.body).toMatchObject({ deck_id: 'd1', preset_id: null, author_preset: 'a1' });
  });

  it('a preset with an id is changed in place, one without is created', async () => {
    const row = {
      id: 'p1',
      name: 'Mía',
      replaces: null,
      config: { newPerDay: 5 },
      updated_at: '2026-11-09T12:00:00+00:00',
    };
    const { study, calls } = repo(() => ({ body: row }));
    const saved = await study.savePreset({ id: 'p1', name: 'Mía', replaces: null, config: {} });
    await study.savePreset({ name: 'Otra', replaces: 'p1', config: {} });
    expect(calls.map((c) => [c.method, c.search.get('id')])).toEqual([
      ['PATCH', 'eq.p1'],
      ['POST', null],
    ]);
    expect(saved).toEqual({
      id: 'p1',
      name: 'Mía',
      replaces: null,
      config: { newPerDay: 5 },
      updatedAt: '2026-11-09T12:00:00+00:00',
    });
  });
});

describe('an assessment’s options', () => {
  it('without a date nor its review days, saves no date and three days', async () => {
    const { study, calls } = repo();
    await study.saveAssessmentSetting({ deckId: 'd1', includeExtras: true, newPerDay: 15 });
    expect(calls[0]!.body).toMatchObject({
      deck_id: 'd1',
      include_extras: true,
      new_per_day: 15,
      exam_date: null,
      final_review_days: 3,
      exam_date_set_at: null,
    });
  });

  it('reads the moment the date was set as ISO, and none as null', async () => {
    const base = { deck_id: 'd1', include_extras: false, new_per_day: 20, final_review_days: 7 };
    const { study } = repo(() => ({
      body: [
        { ...base, exam_date: '2026-12-01', exam_date_set_at: '2026-11-09T12:00:00+00:00' },
        { ...base, deck_id: 'd2', exam_date: null, exam_date_set_at: null },
      ],
    }));
    expect((await study.assessmentSettings()).map((s) => s.examDateSetAt)).toEqual([
      '2026-11-09T12:00:00.000Z',
      null,
    ]);
  });
});
