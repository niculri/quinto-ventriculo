// The preferences saved as a patch: only what changed, and the lists as what they gained and lost, so two devices do
// not overwrite each other; applying one gives what save_study_preferences() stores.
import { PreferencesPatch } from '@qv/schema/user';
import type { ListPatch, StudyPreferences } from '@qv/schema/user';

type ListName = 'addedCourses' | 'removedCourses' | 'dismissed';

/** How many of each list the database keeps (its checks): the newest stay. */
export const PREFERENCE_LIST_CAPS: Record<ListName, number> = {
  addedCourses: 100,
  removedCourses: 100,
  dismissed: 50,
};

const LISTS: readonly ListName[] = ['addedCourses', 'removedCourses', 'dismissed'];
const FIELDS = [
  'timeZone',
  'dayStartsAt',
  'learnAheadMinutes',
  'newCardsIgnoreReviewLimit',
  'applyAllParentLimits',
  'fullAnki',
  'fourButtons',
  'welcomeSeen',
  'semester',
] as const satisfies readonly Exclude<keyof StudyPreferences, ListName>[];

/** What `next` changes of `before`; with nothing stored yet, all of it. */
export function preferencesPatch(
  before: StudyPreferences | null,
  next: StudyPreferences,
): PreferencesPatch {
  const patch: Record<string, unknown> = {};
  for (const field of FIELDS) {
    if (before?.[field] !== next[field]) patch[field] = next[field];
  }
  for (const list of LISTS) {
    const was = before?.[list] ?? [];
    const add = next[list].filter((x) => !was.includes(x));
    const remove = was.filter((x) => !next[list].includes(x));
    if (add.length || remove.length) patch[list] = { add, remove };
  }
  return PreferencesPatch.parse(patch);
}

/** `list` without what the patch takes out or adds, then what it adds (once each), keeping the last `cap`. */
export function applyListPatch(list: readonly string[], patch: ListPatch, cap: number): string[] {
  const add = [...new Set(patch.add)];
  const kept = list.filter((x) => !patch.remove.includes(x) && !add.includes(x));
  return [...kept, ...add].slice(-cap);
}

export function applyPreferencesPatch(
  prefs: StudyPreferences,
  patch: PreferencesPatch,
): StudyPreferences {
  const next: StudyPreferences = { ...prefs };
  for (const field of FIELDS) {
    if (patch[field] !== undefined) Object.assign(next, { [field]: patch[field] });
  }
  for (const list of LISTS) {
    const change = patch[list];
    if (change) next[list] = applyListPatch(prefs[list], change, PREFERENCE_LIST_CAPS[list]);
  }
  return next;
}
