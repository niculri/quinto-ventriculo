// The user's practice test progress kept in the browser, for the demo, the admin mode and the tests.
import { settle } from '../../../../shared/lib/settle';
import type { QuizRepository } from './port';
import { OPEN_ROUNDS } from './model';
import type { AnswerInfo, QuizStep, RoundInfo, SavedQuiz } from './model';
import { storageKeys } from '../../../../shared/lib/storage';

interface LocalData {
  progress: Record<string, SavedQuiz>;
  rounds: (RoundInfo & {
    quizId: string;
    sectionId: string;
    status: 'active' | 'finished' | 'abandoned';
    /** The last save that changed it (as quiz_rounds.updated_at); absent in what was kept before it had one. */
    updatedAt?: string;
  })[];
  answers: (AnswerInfo & { quizId: string; sectionId: string })[];
}

/** A new round, and an answer once (each save of one marks its round as changed, as quiz_rounds.updated_at). */
function keepRoundAndAnswer(d: LocalData, step: QuizStep, at: string) {
  const info = step.roundInfo;
  if (info && !d.rounds.some((r) => r.id === info.id)) {
    d.rounds.push({
      ...info,
      quizId: step.quizId,
      sectionId: step.sectionId,
      status: 'active',
      updatedAt: at,
    });
  }
  const ans = step.answer;
  if (!ans) return;
  if (!d.answers.some((a) => a.roundId === ans.roundId && a.position === ans.position)) {
    d.answers.push({ ...ans, quizId: step.quizId, sectionId: step.sectionId });
  }
  const r = d.rounds.find((x) => x.id === ans.roundId);
  if (r) r.updatedAt = at;
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function localQuizRepository(storage: Storage | null = safeLocalStorage()): QuizRepository {
  const KEY = storageKeys.demo.quiz;
  let memory: LocalData = { progress: {}, rounds: [], answers: [] };
  const read = (): LocalData => {
    if (!storage) return structuredClone(memory);
    try {
      return {
        progress: {},
        rounds: [],
        answers: [],
        ...(JSON.parse(storage.getItem(KEY) ?? 'null') as LocalData | null),
      };
    } catch {
      return { progress: {}, rounds: [], answers: [] };
    }
  };
  const write = (d: LocalData) => {
    memory = d;
    try {
      storage?.setItem(KEY, JSON.stringify(d));
    } catch {
      // stays in memory
    }
  };
  const isObject = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);
  const roundId = (round: unknown) =>
    round && typeof round === 'object' && typeof (round as { id?: unknown }).id === 'string'
      ? (round as { id: string }).id
      : null;

  return {
    load: (quizId) => settle(() => structuredClone(read().progress[quizId] ?? {})),
    save: (step) =>
      settle(() => {
        const d = read();
        const at = new Date().toISOString();
        const quiz = (d.progress[step.quizId] ??= {});
        const before = quiz[step.sectionId];
        const info = step.roundInfo;
        const round = (id: string) => d.rounds.find((r) => r.id === id);
        keepRoundAndAnswer(d, step, at);
        const finished = info?.finished ? round(info.id) : undefined;
        if (finished && finished.status !== 'finished') {
          finished.status = 'finished';
          finished.updatedAt = at;
        }
        const previous = roundId(before?.round);
        if (previous && previous !== roundId(step.round)) {
          const r = round(previous);
          if (r?.status === 'active') {
            r.status = 'abandoned';
            r.updatedAt = at;
          }
        }
        // As save_quiz_progress(): only an object is a round.
        quiz[step.sectionId] = {
          preferences: step.preferences ?? before?.preferences ?? {},
          round: isObject(step.round) ? step.round : null,
          updatedAt: at,
        };
        write(d);
      }),
    openRounds: () =>
      settle(() => {
        const d = read();
        return d.rounds
          .filter((r) => r.status === 'active')
          .map((r) => {
            const answers = d.answers.filter((a) => a.roundId === r.id);
            const last =
              r.updatedAt ??
              answers.reduce((t, a) => (a.answeredAt > t ? a.answeredAt : t), r.startedAt);
            return {
              quizId: r.quizId,
              sectionId: r.sectionId,
              answered: answers.length,
              questionCount: r.questionCount,
              updatedAt: last,
            };
          })
          .filter((r) => r.answered > 0)
          .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
          .slice(0, OPEN_ROUNDS);
      }),
  };
}
