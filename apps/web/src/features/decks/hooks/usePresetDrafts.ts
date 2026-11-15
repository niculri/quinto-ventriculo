// The Anki options form: the chosen preset, what is not saved yet of the presets and the preferences, and saving it
// (by hand, not with `useMutation`: `mutate()` would call the repository after React paints «saving»).

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { SetURLSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { DeckConfig } from '@qv/srs';
import { presetChoices, presetOf, sameRef } from '@qv/study';
import type { PresetChoice, PresetRef } from '@qv/study';
import { useStudyRepository } from '../../progress/api/context';
import { presetParam } from '../../progress/presets';
import { hasPage } from '../../catalog/model/tree';
import type { AnkiTree, CourseDeckNode } from '../../catalog/model/tree';
import { studyKeys } from '../../progress/queries';
import type { DeckSetting, StudyPreferences, UserPreset } from '../../progress/api/repository';
import { useTitle } from '../../../shared/hooks/useTitle';
import { savePresetDrafts } from '../api/savePresets';
import { isDirty, prefsChanged } from '../model/presetDrafts';
import { initialRef, refKey } from '../model/presets';
import { usePresetActions } from './usePresetActions';

export type OptionsMode = 'general' | 'decks';

export interface OptionsData {
  mode: OptionsMode;
  tree: AnkiTree;
  authorPresets: { name: string; config: Record<string, unknown> }[];
  presets: UserPreset[];
  settings: DeckSetting[];
  prefs: StudyPreferences;
}

export function usePresetDrafts(d: OptionsData) {
  const study = useStudyRepository();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const choices = useMemo(
    () => presetChoices(d.authorPresets, d.presets),
    [d.authorPresets, d.presets],
  );

  const [selected, setSelected] = useState<PresetRef>(() =>
    initialRef(params, choices, d.tree, d.settings),
  );
  const state = useDraftState(d.prefs);
  const { drafts, setDrafts, prefs, setSaved, setError } = state;

  const choice: PresetChoice = choices.find((c) => sameRef(c.ref, selected)) ?? choices[0]!;
  const config = drafts.get(refKey(choice.ref)) ?? choice.config;
  const set = (patch: Partial<DeckConfig>) => {
    setSaved(false);
    setDrafts((m) => new Map(m).set(refKey(choice.ref), { ...config, ...patch }));
  };

  useSelectedInUrl(d.mode, presetParam(choice.ref), params, setParams);

  useTitle(d.mode === 'general' ? 'Anki general' : 'Configuración de mazos');

  // The decks above the courses (the root, the semesters) are not studied on the web.
  const users = d.tree.nodes.filter(
    (n): n is CourseDeckNode =>
      hasPage(n) && sameRef(presetOf(n.id, n.preset, choices, d.settings).ref, choice.ref),
  );

  const refresh = () => client.invalidateQueries({ queryKey: studyKeys.all });
  const run = async (what: () => Promise<unknown>) => {
    setError(null);
    try {
      await what();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    }
  };
  const actions = usePresetActions({ choices, choice, setSelected, setDrafts, run });

  const save = async () => {
    state.setSaving(true);
    setError(null);
    try {
      await savePresetDrafts(study, drafts, choices);
      if (prefsChanged(prefs, d.prefs)) await study.savePreferences(prefs);
      await refresh();
      setDrafts(new Map());
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      state.setSaving(false);
    }
  };

  return {
    ...state,
    ...actions,
    choices,
    choice,
    config,
    set,
    setSelected,
    users,
    save,
    dirty: isDirty(drafts, choices, prefs, d.prefs),
  };
}

function useDraftState(savedPrefs: StudyPreferences) {
  const [drafts, setDrafts] = useState<Map<string, DeckConfig>>(new Map());
  const [prefs, setPrefs] = useState<StudyPreferences>(savedPrefs);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const changePrefs = (p: StudyPreferences) => {
    setSaved(false);
    setPrefs(p);
  };
  return {
    drafts,
    setDrafts,
    prefs,
    changePrefs,
    saving,
    setSaving,
    error,
    setError,
    saved,
    setSaved,
  };
}

/** «Configuración de mazos» keeps the chosen preset in its URL, instead of the deck it was opened from. */
function useSelectedInUrl(
  mode: OptionsMode,
  param: string,
  params: URLSearchParams,
  setParams: SetURLSearchParams,
) {
  useEffect(() => {
    if (mode !== 'decks') return;
    if (params.get('preset') === param && !params.has('deck')) return;
    const next = new URLSearchParams(params);
    next.delete('deck');
    next.set('preset', param);
    setParams(next, { replace: true });
  }, [mode, param, params, setParams]);
}
