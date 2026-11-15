// What «Ponte a prueba» links to: a note's test in its topics and its Anki deck.
import type { QuizSummary } from '@qv/schema';
import { paths } from '../../../shared/lib/paths';
import type { CourseRef } from '../../../shared/lib/paths';
import { hasPage } from '../../catalog/model/tree';
import type { AnkiTree, CourseDeckNode } from '../../catalog/model/tree';

export const PRACTICE_ANCHOR = 'ponte-a-prueba';

/** A single-tab test has no tab segment in the URL but takes topics; with several tabs, topics need the tab. */
export function practiceLink(
  course: CourseRef,
  quiz: Pick<QuizSummary, 'assessmentId' | 'slug' | 'sectionCount'>,
  section: string | undefined,
  groups: readonly string[],
): string {
  const single = quiz.sectionCount === 1;
  return paths.quiz(
    course,
    quiz,
    single ? null : (section ?? null),
    groups.length && (section || single) ? groups : null,
  );
}

export function topicsSection(
  quiz: Pick<QuizSummary, 'sectionCount'>,
  section: string | undefined,
  sections: readonly { id: string }[] | undefined,
): string | null {
  if (section) return section;
  return quiz.sectionCount === 1 ? (sections?.[0]?.id ?? null) : null;
}

export function findPracticeDeck(
  tree: AnkiTree,
  assessmentId: string,
  name: string,
): CourseDeckNode | null {
  return (
    tree.nodes.find(
      (n): n is CourseDeckNode => hasPage(n) && n.assessmentId === assessmentId && n.label === name,
    ) ?? null
  );
}
