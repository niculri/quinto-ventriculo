// The configuration a deck uses and changing it.

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { presetChoices, presetOf } from '@qv/study';
import { useStudyRepository } from '../../progress/api/context';
import type { StudyRepository } from '../../progress/api/repository';
import { useCatalog } from '../../catalog/hooks/useCatalog';
import { studyKeys } from '../../progress/api/queries';
import { useDeckSettings, useUserPresets } from '../../progress/hooks/useStudy';
import type { DeckNode } from '../../catalog/model/tree';
import { refKey } from '../model/presets';
import { presetsStrings as p } from '../presets.strings';

type DeckPresetChoice = Parameters<StudyRepository['setDeckPreset']>[1];

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
    networkMode: 'always',
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
        preset:
          choice.ref.kind === 'user'
            ? { presetId: choice.ref.id }
            : choice.ref.name === node.preset
              ? null
              : { authorPreset: choice.ref.name },
      });
      await client.invalidateQueries({ queryKey: studyKeys.all });
    } catch (e) {
      setError(e instanceof Error ? e.message : p.notSaved);
    } finally {
      setSaving(false);
    }
  };

  return { choices, current, error, saving, choose };
}
