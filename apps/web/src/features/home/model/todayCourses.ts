// The courses «Hoy» lists on the home page: those with a video, week or lecture on, or with an answer.

import type { Catalog } from '@qv/schema';
import { buildAnkiTree, courseDeck, descendants } from '../../catalog/model/tree';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { anyOn } from '@qv/study';
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
      return anyOn(below, plan) || below.some((d) => answered.has(d.id));
    });
}
