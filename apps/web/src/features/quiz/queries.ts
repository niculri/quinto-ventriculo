// Queries of a practice test: its detail, a section's questions and what the user has saved of it.
import { useQuery } from '@tanstack/react-query';
import { useServices } from '../../app/services';

export function useQuizDetail(id: string | null) {
  const { api } = useServices();
  return useQuery({
    queryKey: ['quiz', id],
    queryFn: ({ signal }) => api.quiz(id!, signal),
    enabled: !!id,
    staleTime: 5 * 60_000,
  });
}

// Refetched before the signed photo URLs (at least one hour) expire, since a round can last longer.
export function useQuizSection(id: string | null, sectionId: string | null) {
  const { api } = useServices();
  return useQuery({
    queryKey: ['quiz-section', id, sectionId],
    queryFn: ({ signal }) => api.quizSection(id!, sectionId!, signal),
    enabled: !!id && !!sectionId,
    staleTime: 10 * 60_000,
    gcTime: 45 * 60_000,
    refetchInterval: 45 * 60_000,
    refetchOnWindowFocus: true,
  });
}

export const savedQuizKey = (quizId: string) => ['quiz-progress', quizId] as const;

// Read once: the page keeps the cache current as it saves.
export function useSavedQuiz(quizId: string | null) {
  const { quiz } = useServices();
  return useQuery({
    queryKey: savedQuizKey(quizId ?? ''),
    queryFn: () => quiz.load(quizId!),
    enabled: !!quizId,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}
