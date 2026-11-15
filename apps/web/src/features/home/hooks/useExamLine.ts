// The line under a course in «Hoy» about its nearest test, once the study data and today are known.

import type { HomeStudyBase } from '@qv/study';
import { nearestExamText } from '@qv/study';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { usePreferences, useToday } from '../../progress/hooks/useStudy';

export function useExamLine(node: CourseDeckNode, base: HomeStudyBase | null) {
  const { prefs } = usePreferences();
  const today = useToday(prefs);
  return base && today !== null
    ? nearestExamText(
        base.decks,
        base.plan,
        base.progress ?? [],
        node.children.map((c) => c.id),
        today,
        base.prefs,
      )
    : null;
}
