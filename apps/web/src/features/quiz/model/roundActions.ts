// What one can do in a section of a test (start, answer, skip, repeat…): each one is a step of @qv/quiz, committed.
import {
  answerChoice,
  finish,
  isAnswered,
  next,
  repeatAll,
  repeatWrong,
  restart,
  resume,
  selectQuestions,
  selfAssess,
  skip,
  startRound,
  toCover,
} from '@qv/quiz';
import type { Preferences, QuestionInfo, Round } from '@qv/quiz';
import type { QuizSectionDetail } from '@qv/schema';
import type { AnswerInfo } from '@qv/schema/user';
import { answerStep } from './entries';
import type { QuestionEntry } from './entries';

export type Commit = (
  round: Round | null,
  extra?: { preferences?: Preferences; answer?: AnswerInfo },
) => void;

export function roundActions(o: {
  commit: Commit;
  choose: (p: Preferences) => void;
  current: QuestionEntry | null | undefined;
  infos: Map<string, QuestionInfo>;
  shuffle: boolean;
  round: Round | null;
  saver: { retry: () => void };
  groups: QuizSectionDetail['groups'];
}) {
  const { commit, current, infos, shuffle, round, saver, groups } = o;
  return {
    start: (p: Preferences) => {
      const questions = selectQuestions(groups, p.groups).map((q) => infos.get(q.id)!);
      if (!questions.length) return;
      const r = startRound(questions, { shuffle: p.shuffle, shuffleOptions: p.shuffleOptions });
      commit(r, { preferences: p });
    },
    choose: o.choose,
    resume: () => {
      if (round) commit(resume(round));
    },
    discard: () => {
      commit(null);
    },
    answer: (original: number) => {
      if (!round || !current || isAnswered(round)) return;
      const r = answerChoice(round, current.info, original);
      commit(r, { answer: answerStep(r) });
    },
    selfAssess: (knewIt: boolean) => {
      if (!round || !current || isAnswered(round)) return;
      const r = selfAssess(round, current.info, knewIt);
      commit(r, { answer: answerStep(r) });
    },
    next: () => {
      if (round) commit(next(round));
    },
    skip: () => {
      if (round) commit(skip(round));
    },
    finishNow: () => {
      if (round) commit(finish(round));
    },
    home: () => {
      if (round) commit(toCover(round));
    },
    restart: () => {
      if (round) commit(restart(round, infos));
    },
    repeatAll: () => {
      if (round) commit(repeatAll(round, infos, { shuffle }));
    },
    repeatWrong: () => {
      const r = round && repeatWrong(round, infos);
      if (r) commit(r);
    },
    retrySaving: () => {
      saver.retry();
    },
  };
}

export type RoundActions = ReturnType<typeof roundActions>;
