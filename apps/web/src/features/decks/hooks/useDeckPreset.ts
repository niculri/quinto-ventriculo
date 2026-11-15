// The configuration a deck uses and changing it (by hand, not with `useMutation`: `mutate()` would call the
// repository after React paints «saving»).

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { presetChoices, presetOf } from '@qv/study';
import { useStudyRepository } from '../../progress/api/context';
import { useCatalog } from '../../catalog/queries';
import { studyKeys, useDeckSettings, useUserPresets } from '../../progress/queries';
import type { DeckNode } from '../../catalog/model/tree';
import { refKey } from '../model/presets';

export function useDeckPreset(node: DeckNode) {
  const study = useStudyRepository();
  const client = useQueryClient();
  const catalog = useCatalog();
  const presets = useUserPresets();
  const settings = useDeckSettings();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (!catalog.data || !presets.data || !settings.data) return null;
  const choices = presetChoices(catalog.data.anki.presets, presets.data);
  const current = presetOf(node.id, node.preset, choices, settings.data);

  const choose = async (value: string) => {
    const choice = choices.find((c) => refKey(c.ref) === value);
    if (!choice) return;
    setSaving(true);
    setError(null);
    try {
      await study.setDeckPreset(
        node.id,
        choice.ref.kind === 'user'
          ? { presetId: choice.ref.id }
          : choice.ref.name === node.preset
            ? null
            : { authorPreset: choice.ref.name },
      );
      await client.invalidateQueries({ queryKey: studyKeys.all });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  return { choices, current, error, saving, choose };
}
