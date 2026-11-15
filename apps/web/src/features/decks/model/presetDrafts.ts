// Which changes of the Anki options are not saved yet: a preset's draft that differs from it, or other preferences.

import type { DeckConfig } from '@qv/srs';
import type { PresetChoice } from '@qv/study';
import type { StudyPreferences } from '@qv/schema/user';
import { refKey } from './presets';

export const changed = (c: PresetChoice, draft: DeckConfig) =>
  JSON.stringify(draft) !== JSON.stringify(c.config);

export const prefsChanged = (prefs: StudyPreferences, saved: StudyPreferences) =>
  JSON.stringify(prefs) !== JSON.stringify(saved);

export function isDirty(
  drafts: Map<string, DeckConfig>,
  choices: PresetChoice[],
  prefs: StudyPreferences,
  saved: StudyPreferences,
): boolean {
  return (
    prefsChanged(prefs, saved) ||
    [...drafts].some(([key, draft]) => {
      const c = choices.find((x) => refKey(x.ref) === key);
      return !!c && changed(c, draft);
    })
  );
}

/** «Ponle un nombre» or «Ya hay una»: what is wrong with a preset's new name, or null. */
export function nameProblem(
  name: string,
  choices: PresetChoice[],
  isOther: (c: PresetChoice) => boolean,
): 'empty' | 'taken' | null {
  if (!name) return 'empty';
  return choices.some((c) => c.name === name && isOther(c)) ? 'taken' : null;
}
