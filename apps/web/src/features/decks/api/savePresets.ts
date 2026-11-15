// Saves the drafts of the presets that changed: the user's in place, an author's as the user's version of it.

import type { DeckConfig } from '@qv/srs';
import type { PresetChoice } from '@qv/study';
import type { StudyRepository } from '../../progress/api/repository';
import { changed } from '../model/presetDrafts';
import { refKey } from '../model/presets';

export async function savePresetDrafts(
  study: StudyRepository,
  drafts: Map<string, DeckConfig>,
  choices: PresetChoice[],
): Promise<void> {
  for (const [key, draft] of drafts) {
    const c = choices.find((x) => refKey(x.ref) === key);
    if (!c || !changed(c, draft)) continue;
    const stored = { ...draft } as unknown as Record<string, unknown>;
    if (c.ref.kind === 'user') {
      await study.savePreset({ id: c.ref.id, name: c.name, replaces: null, config: stored });
    } else {
      await study.savePreset({
        ...(c.row ? { id: c.row.id } : {}),
        name: c.name,
        replaces: c.name,
        config: stored,
      });
    }
  }
}
