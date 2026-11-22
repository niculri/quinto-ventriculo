// How many questions of a test only the draft has, in the admin mode: what the catalog counts above what the students have.
import type { QuizDetail } from '@qv/schema';
import { useCatalog } from '../../catalog/hooks/useCatalog';

export function useDraftQuestions(quiz: QuizDetail): number {
  const catalog = useCatalog().data;
  if (catalog?.adminOnly === undefined) return 0;
  const listed = catalog.semesters
    .flatMap((s) => s.courses)
    .flatMap((c) => c.assessments)
    .flatMap((a) => a.quizzes)
    .find((q) => q.id === quiz.id);
  return Math.max(0, (listed?.questionCount ?? quiz.questionCount) - quiz.questionCount);
}
