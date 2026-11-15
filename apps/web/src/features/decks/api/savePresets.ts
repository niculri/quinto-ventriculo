// Saves the draft of a preset that changed: the user's in place, an author's as the user's version of it.

import type { DeckConfig } from '@qv/srs';
import type { PresetChoice } from '@qv/study';
import type { StudyRepository, UserPreset } from '../../progress/api/repository';

/** Not `async`: it hands back the repository's own promise, so awaiting it costs no extra tick. */
export function savePresetDraft(
  study: StudyRepository,
  c: PresetChoice,
  draft: DeckConfig,
): Promise<UserPreset> {
  const stored = { ...draft } as unknown as Record<string, unknown>;
  if (c.ref.kind === 'user') {
    return study.savePreset({ id: c.ref.id, name: c.name, replaces: null, config: stored });
  }
  return study.savePreset({
    ...(c.row ? { id: c.row.id } : {}),
    name: c.name,
    replaces: c.name,
    config: stored,
  });
}
