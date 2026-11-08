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

/**
 * The questions of a section. The URLs of its photos last at least one hour, and a round can last longer
 * (a photo is loaded when its question comes up): they are asked for again every 45 minutes, and on coming
 * back to the page after ten minutes.
 */
export function useQuizSection(id: string | null, sectionId: string | null) {
  const { api } = useServices();
  return useQuery({
    queryKey: ['quiz-section', id, sectionId],
    queryFn: ({ signal }) => api.quizSection(id!, sectionId!, signal),
    enabled: !!id && !!sectionId,
    // 10 minutes: a test taken off the site (step 1.5) stops showing soon.
    staleTime: 10 * 60_000,
    gcTime: 45 * 60_000,
    refetchInterval: 45 * 60_000,
    refetchOnWindowFocus: true,
  });
}

export const savedQuizKey = (quizId: string) => ['quiz-progress', quizId] as const;

/**
 * What the user has saved of a test (each section's round and choices). Read once: the page keeps it up to
 * date as it saves (another tab's changes arrive when the page is opened again).
 */
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
