// What a course's page counts: the assessments with material, what each one has, and an assessment's turned-on units.
import type { AssessmentWithNotes, CourseWithAssessments } from '@qv/schema';
import { activeUnits } from '@qv/study';
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

export function withMaterial(course: CourseWithAssessments, tree: AnkiTree) {
  return course.assessments.filter(
    (a) => a.notes.length || a.quizzes.length || assessmentDeck(tree, a),
  );
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

export function unitsOf(node: CourseDeckNode, plan: StudyPlan) {
  return { total: node.children.length, on: activeUnits(descendants(node), plan).size };
}
