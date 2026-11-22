// What a practice test page reads, with its keys: the test, a section's questions and what the user has saved of it.
import { queryOptions } from '@tanstack/react-query';
import type { ApiClient } from '../../../shared/lib/api';
import type { QuizRepository } from './repository';

export const quizKeys = {
  detail: (id: string | null) => ['quiz', id] as const,
  section: (id: string | null, sectionId: string | null) =>
    ['quiz-section', id, sectionId] as const,
  savedAll: ['quiz-progress'] as const,
  saved: (quizId: string) => ['quiz-progress', quizId] as const,
};

export const quizDetailQuery = (api: ApiClient, id: string | null) =>
  queryOptions({
    queryKey: quizKeys.detail(id),
    queryFn: ({ signal }) => api.quiz(id!, signal),
    enabled: !!id,
    staleTime: 5 * 60_000,
  });

// Refetched before the signed photo URLs (at least one hour) expire, since a round can last longer.
export const quizSectionQuery = (api: ApiClient, id: string | null, sectionId: string | null) =>
  queryOptions({
    queryKey: quizKeys.section(id, sectionId),
    queryFn: ({ signal }) => api.quizSection(id!, sectionId!, signal),
    enabled: !!id && !!sectionId,
    staleTime: 10 * 60_000,
    gcTime: 45 * 60_000,
    refetchInterval: 45 * 60_000,
    refetchOnWindowFocus: true,
  });

// Read once: the page keeps the cache current as it saves.
export const savedQuizQuery = (quiz: QuizRepository, quizId: string | null) =>
  queryOptions({
    queryKey: quizKeys.saved(quizId ?? ''),
    queryFn: () => quiz.load(quizId!),
    enabled: !!quizId,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
