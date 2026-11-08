import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  answerChoice,
  back,
  currentQuestionId,
  finish,
  isAnswered,
  next,
  repeatAll,
  repeatWrong,
  restart,
  restorePreferences,
  restoreRound,
  resume,
  selectQuestions,
  selfAssess,
  startRound,
  toCover,
} from '@qv/quiz';
import type { Preferences, QuestionInfo, Round } from '@qv/quiz';
import type { QuizGroup, QuizQuestion, QuizSectionDetail } from '@qv/schema';
import { useServices } from '../../app/services';
import { savedQuizKey } from './queries';
import type { AnswerInfo, RoundInfo, SavedQuiz, SavedSection } from './repository';
import { StepSaver } from './saver';

/** A question with what the round and the screen need: its group and its number in the group. */
export interface QuestionEntry {
  question: QuizQuestion;
  info: QuestionInfo;
  group: QuizGroup;
  /** Its number in its group («Pregunta 4»). */
  number: number;
}

export function questionIndex(section: QuizSectionDetail): Map<string, QuestionEntry> {
  const map = new Map<string, QuestionEntry>();
  for (const group of section.groups) {
    group.questions.forEach((question, i) => {
      map.set(question.id, {
        question,
        group,
        number: i + 1,
        info:
          question.kind === 'choice'
            ? {
                id: question.id,
                options: question.options.length,
                correct: question.correct,
                fixedOrder: question.fixedOrder,
              }
            : { id: question.id },
      });
    });
  }
  return map;
}

function roundInfo(round: Round): RoundInfo {
  return {
    id: round.id,
    origin: round.origin,
    questionCount: round.queue.length,
    shuffled: round.shuffled,
    shuffleOptions: round.shuffleOptions,
    startedAt: round.startedAt,
    finished: round.finished,
  };
}

/**
 * One section of a test, played as the skill's page plays it: the cover's choices, the round and every step,
 * each one saved in the background (the users database, or the browser in demo mode).
 */
export function useQuizSession(options: {
  quizId: string;
  section: QuizSectionDetail;
  saved: SavedSection | undefined;
  /** Arriving from another tab: the cover (the round stays, offered to continue). */
  showCover: boolean;
  /**
   * Arriving from an article's «Ponte a prueba»: the cover with these groups chosen (the ones the section
   * does not have are ignored; none left = as usual).
   */
  topics?: readonly string[] | null;
}) {
  const { quizId, section, saved, showCover, topics } = options;
  const { quiz: repository } = useServices();
  const queryClient = useQueryClient();
  const entries = useMemo(() => questionIndex(section), [section]);
  const infos = useMemo(
    () => new Map([...entries].map(([id, e]) => [id, e.info] as const)),
    [entries],
  );
  const groupIds = useMemo(() => section.groups.map((g) => g.id), [section]);

  const [state, setState] = useState(() => {
    let preferences = restorePreferences(saved?.preferences, groupIds);
    const chosen = groupIds.filter((g) => topics?.includes(g));
    if (chosen.length) preferences = { ...preferences, groups: chosen };
    let round = restoreRound(saved?.round, infos);
    if (round && (showCover || chosen.length) && round.screen !== 'cover') {
      round = round.finished ? { ...round, screen: 'cover' as const } : toCover(round);
    }
    return { preferences, round };
  });

  // One saver for the screen's life: the steps of this section, in order.
  const [saver] = useState(() => new StepSaver(repository));
  const status = useSyncExternalStore(
    useCallback((fn) => saver.subscribe(fn), [saver]),
    () => (saver.failed ? 'failed' : saver.pending ? 'saving' : 'saved'),
  );

  // Something not saved yet: the browser asks before closing or reloading.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saver.pending) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [saver]);

  const commit = useCallback(
    (round: Round | null, extra: { preferences?: Preferences; answer?: AnswerInfo } = {}) => {
      setState((s) => ({ preferences: extra.preferences ?? s.preferences, round }));
      saver.push({
        quizId,
        sectionId: section.sectionId,
        round,
        ...(extra.preferences ? { preferences: extra.preferences } : {}),
        ...(round ? { roundInfo: roundInfo(round) } : {}),
        ...(extra.answer ? { answer: extra.answer } : {}),
      });
      // What the page has saved, for when it comes back to this section (another tab, the last one used).
      queryClient.setQueryData<SavedQuiz>(savedQuizKey(quizId), (old) => ({
        ...old,
        [section.sectionId]: {
          preferences: extra.preferences ?? old?.[section.sectionId]?.preferences ?? {},
          round,
          updatedAt: new Date().toISOString(),
        },
      }));
    },
    [queryClient, quizId, saver, section.sectionId],
  );

  const { round, preferences } = state;
  const current = round && round.screen !== 'cover' ? entries.get(currentQuestionId(round)) : null;

  const actions = useMemo(() => {
    const answerStep = (r: Round): AnswerInfo | undefined => {
      const a = r.answers.find((x) => x.position === r.index);
      return a
        ? {
            roundId: r.id,
            questionId: a.questionId,
            position: a.position,
            chosen: a.chosen,
            correct: a.correct,
            answeredAt: a.at,
          }
        : undefined;
    };
    return {
      /** «Comenzar»: a new round with the chosen groups. */
      start(p: Preferences) {
        const questions = selectQuestions(section.groups, p.groups).map((q) => infos.get(q.id)!);
        if (!questions.length) return;
        const r = startRound(questions, { shuffle: p.shuffle, shuffleOptions: p.shuffleOptions });
        commit(r, { preferences: p });
      },
      /** The cover's choices, before starting (they are saved with «Comenzar», as the page does). */
      choose(p: Preferences) {
        setState((s) => ({ ...s, preferences: p }));
      },
      resume() {
        if (round) commit(resume(round));
      },
      discard() {
        commit(null);
      },
      answer(original: number) {
        if (!round || !current || isAnswered(round)) return;
        const r = answerChoice(round, current.info, original);
        commit(r, { answer: answerStep(r)! });
      },
      selfAssess(knewIt: boolean) {
        if (!round || !current || isAnswered(round)) return;
        const r = selfAssess(round, current.info, knewIt);
        commit(r, { answer: answerStep(r)! });
      },
      next() {
        if (round) commit(next(round));
      },
      back() {
        if (round) commit(back(round));
      },
      finishNow() {
        if (round) commit(finish(round));
      },
      home() {
        if (round) commit(toCover(round));
      },
      restart() {
        if (round) commit(restart(round, infos));
      },
      repeatAll() {
        if (round) commit(repeatAll(round, infos, { shuffle: preferences.shuffle }));
      },
      repeatWrong() {
        const r = round && repeatWrong(round, infos);
        if (r) commit(r);
      },
      retrySaving() {
        saver.retry();
      },
    };
  }, [commit, current, infos, preferences.shuffle, round, saver, section.groups]);

  return { round, preferences, current, entries, actions, saving: status };
}
