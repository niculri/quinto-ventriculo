// What a test page shows: an error, «loading», not found, a redirect to its own address, or its section's screen; and
// the `?topics=` of a link, read once and dropped from the URL (a reload must not reopen the cover).
import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import type { UseQueryResult } from '@tanstack/react-query';
import type { QuizDetail, QuizSectionDetail, QuizSectionSummary } from '@qv/schema';
import { paths } from '../../../shared/lib/paths';
import { useReadingFonts } from '../../../shared/lib/readingFonts';
import { findCourse } from '../../catalog/model/catalog';
import { useCatalog } from '../../catalog/hooks/useCatalog';
import { useCountOpen } from '../../usage/api/count';
import type { SavedQuiz } from '../api/repository';
import { rememberedTab } from '../api/tab';
import { lastUsedTab } from '../model/tab';
import type { QuizState } from './useQuizScreen';
import { useQuizDetail, useQuizSection, useSavedQuiz } from './useQuizData';

type Found = NonNullable<ReturnType<typeof findCourse>>;

export type QuizPageView =
  | { kind: 'error'; query: UseQueryResult<unknown> }
  | { kind: 'loading' }
  | { kind: 'notFound' }
  | { kind: 'canonical'; path: string }
  | {
      kind: 'ready';
      quiz: QuizDetail;
      found: Found;
      section: QuizSectionSummary;
      detail: QuizSectionDetail;
      saved: SavedQuiz;
      onlyTest: boolean;
      assessment: Found['course']['assessments'][number] | undefined;
      fromTab: boolean;
      inRound: boolean;
      topics: readonly string[] | null;
    };

function useArrival(sectionId: string | undefined) {
  const location = useLocation();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const [arrival, setArrival] = useState(() => {
    const topics = search.get('topics')?.split(',').filter(Boolean);
    return topics?.length ? { section: sectionId ?? null, topics } : null;
  });
  if (arrival && (sectionId ?? null) !== arrival.section) setArrival(null);
  useEffect(() => {
    if (search.has('topics')) {
      const rest = new URLSearchParams(search);
      rest.delete('topics');
      const text = rest.toString();
      void navigate(
        { pathname: location.pathname, search: text ? `?${text}` : '', hash: location.hash },
        { replace: true, state: location.state },
      );
    }
  }, [search, navigate, location]);
  const topics = arrival && (sectionId ?? null) === arrival.section ? arrival.topics : null;
  return { location, topics };
}

function quizIn(found: Found | null, courseId: string, assessment: string, slug: string) {
  return (
    found?.course.assessments
      .find((a) => a.id === `${courseId}/${assessment}`)
      ?.quizzes.find((q) => q.slug === slug) ?? null
  );
}

export function useQuizPage(): QuizPageView {
  const { courseId = '', number = '', assessment = '', quizSlug = '', sectionId } = useParams();
  const { location, topics } = useArrival(sectionId);
  const catalog = useCatalog();
  const found = catalog.data ? findCourse(catalog.data, courseId) : null;
  const summary = quizIn(found, courseId, assessment, quizSlug);
  const quiz = useQuizDetail(summary?.id ?? null);
  useCountOpen('quiz', quiz.data?.id ?? null);
  const saved = useSavedQuiz(quiz.data?.id ?? null);
  const sections = quiz.data?.sections ?? [];
  const active: QuizSectionSummary | null =
    sections.length === 1 ? sections[0]! : (sections.find((x) => x.id === sectionId) ?? null);
  const detail = useQuizSection(quiz.data?.id ?? null, active?.id ?? null);
  const fonts = useReadingFonts();

  // A failed refetch (to renew the photo URLs) keeps the data, so the round goes on.
  const failed = [catalog, quiz, saved, detail].find((q) => q.isError && q.data === undefined);
  if (failed) return { kind: 'error', query: failed };
  if (!catalog.data) return { kind: 'loading' };
  if (!found || !summary) return { kind: 'notFound' };
  if (!quiz.data || !saved.data) return { kind: 'loading' };
  const data = quiz.data;
  const { semester, course } = found;
  if (String(semester.number) !== number) {
    return { kind: 'canonical', path: paths.quiz(course, data, sectionId) };
  }
  if (sections.length === 1 && sectionId)
    return { kind: 'canonical', path: paths.quiz(course, data) };
  if (sections.length > 1 && !sectionId) {
    const tab = lastUsedTab(data, saved.data, rememberedTab(data.id));
    return { kind: 'canonical', path: paths.quiz(course, data, tab) };
  }
  if (!active) return { kind: 'notFound' };
  if (!detail.data || !fonts) return { kind: 'loading' };
  const inAssessment = course.assessments.find((a) => a.id === data.assessmentId);
  const state = location.state as QuizState | null;
  return {
    kind: 'ready',
    quiz: data,
    found,
    section: active,
    detail: detail.data,
    saved: saved.data,
    assessment: inAssessment,
    onlyTest: !!inAssessment && inAssessment.quizzes.length === 1,
    fromTab: state?.fromTab === true,
    inRound: state?.inRound === true,
    topics,
  };
}
