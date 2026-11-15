// The courses «Hoy» lists on the home page: those with a week or class on, or with an answer.

import type { Catalog } from '@qv/schema';
import { buildAnkiTree, courseDeck, descendants } from '../../catalog/model/tree';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { activeUnits } from '@qv/study';
import type { StudyPlan } from '@qv/study';

export function todayCourses(catalog: Catalog, plan: StudyPlan): CourseDeckNode[] {
  const tree = buildAnkiTree(catalog);
  const answered = new Set(plan.answeredDecks);
  return catalog.semesters
    .flatMap((s) => s.courses)
    .map((c) => courseDeck(tree, c.id))
    .filter((n): n is CourseDeckNode => n !== null)
    .filter((n) => {
      const below = descendants(n);
      return activeUnits(below, plan).size > 0 || below.some((d) => answered.has(d.id));
    });
}
