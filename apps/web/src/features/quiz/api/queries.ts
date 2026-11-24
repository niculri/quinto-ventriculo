// What a practice test page reads, with its keys: the test, a section's questions and what the user has saved of it.
import { queryOptions } from '@tanstack/react-query';
import type { ApiClient } from '../../../shared/lib/api';
import { CONTENT_QUERY } from '../../../shared/lib/contentQuery';
import type { QuizRepository } from './repository';

export const quizKeys = {
  detail: (id: string | null, published = false) =>
    published ? (['quiz', id, 'published'] as const) : (['quiz', id] as const),
  section: (id: string | null, sectionId: string | null, published = false) =>
    published
      ? (['quiz-section', id, sectionId, 'published'] as const)
      : (['quiz-section', id, sectionId] as const),
  savedAll: ['quiz-progress'] as const,
  saved: (quizId: string) => ['quiz-progress', quizId] as const,
};

/** `published`: the admin mode reads the test as the students have it (see `useStudentsHave`). */
export const quizDetailQuery = (api: ApiClient, id: string | null, published = false) =>
  queryOptions({
    queryKey: quizKeys.detail(id, published),
    queryFn: ({ signal }) => api.quiz(id!, signal, { published }),
    meta: CONTENT_QUERY,
    enabled: !!id,
    staleTime: 5 * 60_000,
  });

// Its signed photos are signed again by the page itself when they are about to expire (shared/hooks/useSignedImage).
export const quizSectionQuery = (
  api: ApiClient,
  id: string | null,
  sectionId: string | null,
  published = false,
) =>
  queryOptions({
    queryKey: quizKeys.section(id, sectionId, published),
    queryFn: ({ signal }) => api.quizSection(id!, sectionId!, signal, { published }),
    meta: CONTENT_QUERY,
    enabled: !!id && !!sectionId,
    staleTime: 10 * 60_000,
    gcTime: 45 * 60_000,
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
