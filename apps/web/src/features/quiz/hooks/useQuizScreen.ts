// The state of a test section's screen: the session, the history entry of a round, the popups, «revealed» and the keys.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { QuizDetail, QuizSectionDetail, QuizSectionSummary } from '@qv/schema';
import type { CourseRef } from '../../../shared/lib/paths';
import { paths } from '../../../shared/lib/paths';
import { useFocusMode } from '../../../shared/ui/focus';
import type { OpenImage } from '../../../shared/ui/ImageViewer';
import { rememberTab } from '../api/tab';
import type { SavedQuiz } from '../api/repository';
import type { QuestionEntry } from '../model/entries';
import { reportTarget } from '../api/reportTarget';
import { useQuizSession } from './useQuizSession';
import { useQuizShortcuts } from './useQuizShortcuts';

// History entry state: `inRound` lets a reload or «back» return to the round, while a link opens the cover.
export interface QuizState {
  fromTab?: boolean;
  inRound?: boolean;
}

function useRoundInHistory(screen: string, navigate: ReturnType<typeof useNavigate>) {
  const location = useLocation();
  useEffect(() => {
    const state = (location.state as QuizState | null) ?? {};
    if (screen === 'question' && !state.inRound) {
      void navigate(location, {
        replace: true,
        preventScrollReset: true,
        state: { ...state, fromTab: false, inRound: true },
      });
    }
  }, [screen, location, navigate]);
}

function usePopups() {
  const [zoom, setZoom] = useState<OpenImage | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reporting, setReporting] = useState<QuestionEntry | null>(null);
  const [thanks, setThanks] = useState(false);
  useEffect(() => {
    if (!thanks) return;
    const id = setTimeout(() => setThanks(false), 3000);
    return () => clearTimeout(id);
  }, [thanks]);
  return { zoom, setZoom, confirming, setConfirming, reporting, setReporting, thanks, setThanks };
}

export function useQuizScreen(o: {
  quiz: QuizDetail;
  section: QuizSectionSummary;
  detail: QuizSectionDetail;
  course: CourseRef;
  saved: SavedQuiz;
  fromTab: boolean;
  inRound: boolean;
  topics: readonly string[] | null;
}) {
  const { quiz, section, course } = o;
  const navigate = useNavigate();
  const session = useQuizSession({
    quizId: quiz.id,
    section: o.detail,
    saved: o.saved[section.id],
    showCover: o.fromTab || !o.inRound,
    topics: o.topics,
  });
  const { round, current, actions } = session;
  const screen = round?.screen ?? 'cover';
  useFocusMode(screen === 'question');
  useRoundInHistory(screen, navigate);
  const popups = usePopups();
  const [revealedAt, setRevealedAt] = useState<string | null>(null);
  const restartRef = useRef<HTMLButtonElement>(null);

  // With the question id: after «Saltar» another question is at the same index.
  const position =
    round && screen === 'question'
      ? `${round.id}/${round.index}/${String(round.queue[round.index])}`
      : screen;
  const revealed = revealedAt === position;
  const reveal = useCallback(() => setRevealedAt(position), [position]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [position]);
  useQuizShortcuts({ ...popups, screen, round, current, revealed, reveal, actions });

  return {
    session,
    screen,
    popups,
    revealed,
    reveal,
    restartRef,
    sectionIndex: quiz.sections.findIndex((x) => x.id === section.id),
    target: (e: QuestionEntry) => reportTarget(quiz, course, section, e),
    tab: (id: string) => {
      rememberTab(quiz.id, id);
      void navigate(paths.quiz(course, quiz, id), { state: { fromTab: true } });
    },
  };
}
