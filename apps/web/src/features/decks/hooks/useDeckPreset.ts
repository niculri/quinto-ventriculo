// The configuration a deck uses and changing it.

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { presetChoices, presetOf } from '@qv/study';
import type { PresetChoice } from '@qv/study';
import { useStudyRepository } from '../../progress/api/context';
import { errorText } from '../../../shared/lib/errorText';
import type { StudyRepository } from '../../progress/api/repository';
import { useCatalog } from '../../catalog/hooks/useCatalog';
import { studyKeys, useDeckSettings, useUserPresets } from '../../progress/queries';
import type { DeckNode } from '../../catalog/model/tree';
import { refKey } from '../model/presets';
import { usePresetDraftsStrings } from './strings/usePresetDrafts.strings';

type DeckPresetChoice = Parameters<StudyRepository['setDeckPreset']>[1];

// Outside the hook: React Compiler does not compile a conditional inside `try`.
function presetToSave(choice: PresetChoice, deckPreset: DeckNode['preset']): DeckPresetChoice {
  if (choice.ref.kind === 'user') return { presetId: choice.ref.id };
  return choice.ref.name === deckPreset ? null : { authorPreset: choice.ref.name };
}

export function useDeckPreset(node: DeckNode) {
  const study = useStudyRepository();
  const client = useQueryClient();
  const catalog = useCatalog();
  const presets = useUserPresets();
  const settings = useDeckSettings();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const setDeckPreset = useMutation({
    mutationFn: ({ deckId, preset }: { deckId: string; preset: DeckPresetChoice }) =>
      study.setDeckPreset(deckId, preset),
  });
  if (!catalog.data || !presets.data || !settings.data) return null;
  const choices = presetChoices(catalog.data.anki.presets, presets.data);
  const current = presetOf(node.id, node.preset, choices, settings.data);

  const choose = async (value: string) => {
    const choice = choices.find((c) => refKey(c.ref) === value);
    if (!choice) return;
    setSaving(true);
    setError(null);
    try {
      await setDeckPreset.mutateAsync({
        deckId: node.id,
        preset: presetToSave(choice, node.preset),
      });
      await client.invalidateQueries({ queryKey: studyKeys.all });
    } catch (e) {
      setError(errorText(e, usePresetDraftsStrings.notSaved));
    }
    setSaving(false);
  };

  return { choices, current, error, saving, choose };
}
