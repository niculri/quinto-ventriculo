// The reads of a practice test page: the test, a section's questions and what the user has saved of it.
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../../shared/hooks/useApi';
import { useQuizRepository } from '../api/context';
import { quizDetailQuery, quizSectionQuery, savedQuizQuery } from '../api/queries';

export function useQuizDetail(id: string | null) {
  return useQuery(quizDetailQuery(useApi(), id));
}

export function useQuizSection(id: string | null, sectionId: string | null) {
  return useQuery(quizSectionQuery(useApi(), id, sectionId));
}

export function useSavedQuiz(quizId: string | null) {
  return useQuery(savedQuizQuery(useQuizRepository(), quizId));
}
