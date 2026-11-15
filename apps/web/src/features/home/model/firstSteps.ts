// The first steps on the home page: which are done, which comes next and whether they still show.

import type { StudyPreferences } from '@qv/schema/user';

const FIRST_STEPS = 'first-steps';

export interface Steps {
  course: boolean;
  unit: boolean;
  card: boolean;
}

export const nextStep = (steps: Steps) => (!steps.course ? 1 : !steps.unit ? 2 : 3);

export const showFirstSteps = (steps: Steps, prefs: Pick<StudyPreferences, 'dismissed'>) =>
  !(steps.course && steps.unit && steps.card) && !prefs.dismissed.includes(FIRST_STEPS);

export const hideFirstSteps = <T extends Pick<StudyPreferences, 'dismissed'>>(prefs: T): T => ({
  ...prefs,
  dismissed: [...prefs.dismissed, FIRST_STEPS],
});
