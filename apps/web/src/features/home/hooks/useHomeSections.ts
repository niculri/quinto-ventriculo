// What the home page's sections show: the preferences as the student just chose them (while they are saved), the
// courses of «Hoy» and of «Tus ramos», and which first steps are done.

import { useMemo } from 'react';
import type { Catalog } from '@qv/schema';
import { activeUnits } from '@qv/study';
import type { StudyPlan } from '@qv/study';
import { buildAnkiTree, courseDeck } from '../../catalog/model/tree';
import { paths } from '../../../shared/lib/paths';
import { useSavePreferences } from '../../progress/hooks/useStudy';
import type { StudyPreferences } from '../../progress/api/repository';
import { showFirstSteps } from '../model/firstSteps';
import { myCourses } from '../model/myCourses';
import { todayCourses } from '../model/todayCourses';

export function useHomeSections(catalog: Catalog, saved: StudyPreferences, plan: StudyPlan) {
  const save = useSavePreferences();
  const shown = save.isPending && save.variables ? save.variables : saved;
  const tree = useMemo(() => buildAnkiTree(catalog), [catalog]);
  const today = useMemo(() => todayCourses(catalog, plan), [catalog, plan]);
  const mine = useMemo(
    () =>
      myCourses(catalog, shown, new Set(today.flatMap((n) => (n.courseId ? [n.courseId] : [])))),
    [catalog, shown, today],
  );
  const anyOn = useMemo(() => activeUnits(tree.nodes, plan).size > 0, [tree, plan]);
  const withDecks = mine.cards.filter((c) => courseDeck(tree, c.id));
  const choose = withDecks.length >= 1 ? paths.course(withDecks[0]!) : '#tus-ramos';
  const steps = {
    course: shown.semester !== null || shown.addedCourses.length > 0 || today.length > 0,
    unit: anyOn,
    card: plan.answeredDecks.length > 0,
  };
  return {
    save: (prefs: StudyPreferences) => save.mutate(prefs),
    shown,
    today,
    mine,
    choose,
    steps,
    showSteps: showFirstSteps(steps, shown),
  };
}
