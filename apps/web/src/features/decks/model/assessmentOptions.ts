// What the number of new cards a day shows: the student's, the computed one with a date, or none yet.

import type { AssessmentView } from '@qv/study';

export const MAX_NEW_PER_DAY = 9999;

export function paceOf(view: AssessmentView | null, text: string) {
  const kind = view?.pace.kind;
  const computed = kind === 'computed' || kind === 'final-review' || kind === 'finished';
  const locked = !view || computed || kind === 'nothing-on';
  const shownNumber =
    !view || kind === 'nothing-on' ? '' : computed ? String(view.pace.newPerDay) : text;
  return { kind, computed, locked, shownNumber };
}
