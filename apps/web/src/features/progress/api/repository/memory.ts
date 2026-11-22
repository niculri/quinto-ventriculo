// A browser copy of the user's study data with the same rules as the database, for the demo, the administrator's
// admin mode and the tests.
import { createChanges } from './localChanges';
import { localAnswers } from './localAnswers';
import { localMarks } from './localMarks';
import { localReads } from './localReads';
import { localReviews } from './localReviews';
import { localSettings } from './localSettings';
import { createLocalStore } from './localStore';
import { localSync } from './localSync';
import type { StudyPreferences } from './model';
import type { StudyRepository } from './port';

export function localStudyRepository(
  storage?: Storage | null,
  preferences?: Partial<StudyPreferences>,
): StudyRepository {
  const store = createLocalStore(storage, preferences);
  const changes = createChanges(store.stamp);
  return {
    ...localReads(store),
    ...localAnswers(store),
    ...localSettings(store),
    ...localReviews(store, changes),
    ...localMarks(store, changes),
    ...localSync(store),
  };
}
