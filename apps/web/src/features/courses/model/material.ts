// What a course's page counts: the assessments with material, what each one has, and an assessment's units with
// something on.
import type { AssessmentWithNotes, Catalog, CourseWithAssessments } from '@qv/schema';
import { assessmentHasMaterial } from '@qv/schema/http';
import { activation, unitState } from '@qv/study';
import type { StudyPlan } from '@qv/study';
import { descendants, hasPage } from '../../catalog/model/tree';
import type { AnkiTree, CourseDeckNode } from '../../catalog/model/tree';
import { materialStrings as s } from './strings/material.strings';

export function assessmentDeck(tree: AnkiTree, a: AssessmentWithNotes): CourseDeckNode | null {
  return (
    tree.nodes.find(
      (n): n is CourseDeckNode => n.depth === 3 && hasPage(n) && n.assessmentId === a.id,
    ) ?? null
  );
}

export function withMaterial(catalog: Catalog, course: CourseWithAssessments) {
  return course.assessments.filter((a) => assessmentHasMaterial(catalog, a));
}

export const joined = (parts: string[]) => parts.filter(Boolean).join(' · ');

/** «2 clases · 1 seminario · 1 otro». */
export function notesLine(a: AssessmentWithNotes): string {
  const lectures = a.notes.filter((n) => n.kind === 'lecture').length;
  const seminars = a.notes.filter((n) => n.kind === 'seminar').length;
  const others = a.notes.length - lectures - seminars;
  return joined([
    lectures ? s.lectures(lectures) : '',
    seminars ? s.seminars(seminars) : '',
    others ? s.others(others) : '',
  ]);
}

/** A week counts as on with any of its videos on. */
export function unitsOf(node: CourseDeckNode, plan: StudyPlan) {
  const a = activation(descendants(node), plan);
  // Each deck under an assessment is a week or a lecture, so it has a state.
  const on = node.children.filter((u) => unitState(a, u.id)!.on > 0).length;
  return { total: node.children.length, on };
}
