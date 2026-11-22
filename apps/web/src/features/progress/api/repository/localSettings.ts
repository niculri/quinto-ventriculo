// The browser copy's settings: preferences, presets and what each deck and assessment chose.
import { settle } from '../../../../shared/lib/settle';
import type { LocalStore } from './localStore';
import { uuid } from './localStore';
import { defaultPreferences } from './model';
import type { UserPreset } from './model';
import type { StudyRepository } from './port';

type SettingsMethods = Pick<
  StudyRepository,
  | 'preferences'
  | 'savePreferences'
  | 'presets'
  | 'savePreset'
  | 'deletePreset'
  | 'deckSettings'
  | 'setDeckPreset'
  | 'deckActivations'
  | 'setDeckActivation'
  | 'assessmentSettings'
  | 'saveAssessmentSetting'
>;

export function localSettings({ read, write, stamp }: LocalStore): SettingsMethods {
  return {
    preferences: () =>
      settle(() => {
        const saved = read().preferences;
        return saved ? { ...defaultPreferences(saved.timeZone), ...saved } : null;
      }),
    savePreferences: (p) =>
      settle(() => {
        write({ ...read(), preferences: p });
      }),
    presets: () => settle(() => read().presets),
    savePreset: ({ id, name, replaces, config }) =>
      settle(() => {
        const d = read();
        if (!id && replaces && d.presets.some((p) => p.replaces === replaces)) {
          throw new Error('No se pudo guardar las opciones: ya existe.');
        }
        const preset: UserPreset = { id: id ?? uuid(), name, replaces, config, updatedAt: stamp() };
        // An edit keeps its place: the database lists them in the order they were made.
        const kept = d.presets.some((p) => p.id === preset.id);
        const presets = kept
          ? d.presets.map((p) => (p.id === preset.id ? preset : p))
          : [...d.presets, preset];
        write({ ...d, presets });
        return preset;
      }),
    deletePreset: (id) =>
      settle(() => {
        const d = read();
        write({
          ...d,
          presets: d.presets.filter((p) => p.id !== id),
          settings: d.settings.filter((s) => s.presetId !== id),
        });
      }),
    deckSettings: () => settle(() => read().settings),
    setDeckPreset: (deckId, choice) =>
      settle(() => {
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
      }),
    deckActivations: () => settle(() => read().activations),
    setDeckActivation: (deckId, active) =>
      settle(() => {
        const d = read();
        write({
          ...d,
          activations: [...d.activations.filter((a) => a.deckId !== deckId), { deckId, active }],
        });
      }),
    assessmentSettings: () => settle(() => read().assessments),
    saveAssessmentSetting: (setting) =>
      settle(() => {
        const d = read();
        write({
          ...d,
          assessments: [...d.assessments.filter((a) => a.deckId !== setting.deckId), setting],
        });
      }),
  };
}
