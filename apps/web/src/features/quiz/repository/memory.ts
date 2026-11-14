// The user's practice test progress kept in the browser, for the demo, the preview and the tests.
import type { QuizRepository } from './port';
import { OPEN_ROUNDS } from './model';
import type { AnswerInfo, RoundInfo, SavedQuiz } from './model';

interface LocalData {
  progress: Record<string, SavedQuiz>;
  rounds: (RoundInfo & {
    quizId: string;
    sectionId: string;
    status: 'active' | 'finished' | 'abandoned';
  })[];
  answers: (AnswerInfo & { quizId: string; sectionId: string })[];
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function localQuizRepository(storage: Storage | null = safeLocalStorage()): QuizRepository {
  const KEY = 'qv-demo-quiz';
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
  const roundId = (round: unknown) =>
    round && typeof round === 'object' && typeof (round as { id?: unknown }).id === 'string'
      ? (round as { id: string }).id
      : null;

  return {
    async load(quizId) {
      return structuredClone(read().progress[quizId] ?? {});
    },
    async save(step) {
      const d = read();
      const quiz = (d.progress[step.quizId] ??= {});
      const before = quiz[step.sectionId];
      const info = step.roundInfo;
      if (info && !d.rounds.some((r) => r.id === info.id)) {
        d.rounds.push({
          ...info,
          quizId: step.quizId,
          sectionId: step.sectionId,
          status: 'active',
        });
      }
      const ans = step.answer;
      if (ans && !d.answers.some((a) => a.roundId === ans.roundId && a.position === ans.position)) {
        d.answers.push({ ...ans, quizId: step.quizId, sectionId: step.sectionId });
      }
      if (info?.finished) {
        const r = d.rounds.find((x) => x.id === info.id);
        if (r) r.status = 'finished';
      }
      const previous = roundId(before?.round);
      if (previous && previous !== roundId(step.round)) {
        const r = d.rounds.find((x) => x.id === previous);
        if (r && r.status === 'active') r.status = 'abandoned';
      }
      quiz[step.sectionId] = {
        preferences: step.preferences ?? before?.preferences ?? {},
        round: step.round ?? null,
        updatedAt: new Date().toISOString(),
      };
      write(d);
    },
    async openRounds() {
      const d = read();
      return d.rounds
        .filter((r) => r.status === 'active')
        .map((r) => {
          const answers = d.answers.filter((a) => a.roundId === r.id);
          const last = answers.reduce((t, a) => (a.answeredAt > t ? a.answeredAt : t), r.startedAt);
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
    },
  };
}
