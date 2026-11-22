// The reads of a practice test page: the test, a section's questions and what the user has saved of it.
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../../shared/hooks/useApi';
import { useStudentsHave } from '../../catalog/hooks/useStudentView';
import { useQuizRepository } from '../api/context';
import { quizDetailQuery, quizSectionQuery, savedQuizQuery } from '../api/queries';

/** The test and its section as the students have them in the admin mode: what only the draft has is not in the round. */
export function useQuizDetail(id: string | null) {
  const asStudents = useStudentsHave(['quiz', id ?? '']);
  return useQuery(quizDetailQuery(useApi(), id, asStudents));
}

export function useQuizSection(id: string | null, sectionId: string | null) {
  const asStudents = useStudentsHave(['quiz', id ?? '']);
  return useQuery(quizSectionQuery(useApi(), id, sectionId, asStudents));
}

export function useSavedQuiz(quizId: string | null) {
  return useQuery(savedQuizQuery(useQuizRepository(), quizId));
}
