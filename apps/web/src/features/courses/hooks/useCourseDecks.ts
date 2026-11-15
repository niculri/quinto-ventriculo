// What a course's page needs of its decks: the tree, the course's deck with its counts and mastery, today and the plan.
import type { Catalog, CourseWithAssessments } from '@qv/schema';
import { buildAnkiTree, courseDeck } from '../../catalog/model/tree';
import { useDeck } from '../../decks/hooks/useDeck';
import { useDeckCounts } from '../../progress/hooks/useDeckCounts';
import { usePreferences } from '../../progress/hooks/usePreferences';
import { useStudyPlan } from '../../progress/hooks/useStudyPlan';
import { useToday } from '../../progress/hooks/useToday';

export function useCourseDecks(catalog: Catalog, course: CourseWithAssessments) {
  const tree = buildAnkiTree(catalog);
  const decks = courseDeck(tree, course.id);
  // The course's deck counts every deck below it: one query for the whole page.
  const deck = useDeck(decks?.id ?? '', decks !== null);
  const { counts, mastery, error, data } = useDeckCounts(deck.data);
  const failed = deck.isError || !!error;
  const { prefs } = usePreferences();
  const today = useToday(prefs);
  const studyPlan = useStudyPlan();
  const plan = prefs ? (studyPlan.data ?? null) : null;
  return { tree, decks, counts, mastery, failed, data, today, plan };
}

export type CourseDecks = ReturnType<typeof useCourseDecks>;
