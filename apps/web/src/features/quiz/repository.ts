// The user's practice test progress in the users database (round and cover choices per section, rounds and answers),
// with a Supabase implementation and an in-browser one for the demo.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RoundOrigin } from '@qv/quiz';

export interface SavedSection {
  preferences: unknown;
  round: unknown;
  updatedAt: string;
}

export type SavedQuiz = Record<string, SavedSection>;

export interface RoundInfo {
  id: string;
  origin: RoundOrigin;
  questionCount: number;
  shuffled: boolean;
  shuffleOptions: boolean;
  startedAt: string;
  finished: boolean;
}

export interface AnswerInfo {
  roundId: string;
  questionId: string;
  position: number;
  chosen: number | null;
  correct: boolean;
  answeredAt: string;
}

export interface QuizStep {
  quizId: string;
  sectionId: string;
  preferences?: unknown;
  round: unknown;
  roundInfo?: RoundInfo;
  answer?: AnswerInfo;
}

interface OpenRound {
  quizId: string;
  sectionId: string;
  answered: number;
  questionCount: number;
  updatedAt: string;
}

export const OPEN_ROUNDS = 5;

export interface QuizRepository {
  load(quizId: string): Promise<SavedQuiz>;
  save(step: QuizStep): Promise<void>;
  openRounds(): Promise<OpenRound[]>;
}

export function supabaseQuizRepository(client: SupabaseClient): QuizRepository {
  return {
    async load(quizId) {
      const r = await client
        .from('quiz_progress')
        .select('section_id, preferences, round, updated_at')
        .eq('quiz_id', quizId);
      if (r.error) throw new Error(`No se pudo leer tu avance (${r.error.message}).`);
      const out: SavedQuiz = {};
      for (const row of (r.data ?? []) as {
        section_id: string;
        preferences: unknown;
        round: unknown;
        updated_at: string;
      }[]) {
        out[row.section_id] = {
          preferences: row.preferences,
          round: row.round,
          updatedAt: row.updated_at,
        };
      }
      return out;
    },
    async save(step) {
      const r = await client.rpc('save_quiz_progress', { p: step });
      if (r.error) throw new Error(`No se pudo guardar tu avance (${r.error.message}).`);
    },
    async openRounds() {
      const r = await client
        .from('quiz_rounds')
        .select('quiz_id, section_id, answered, question_count, updated_at')
        .eq('status', 'active')
        .gt('answered', 0)
        .order('updated_at', { ascending: false })
        .limit(OPEN_ROUNDS);
      if (r.error) throw new Error(`No se pudo leer tus tests (${r.error.message}).`);
      return (
        (r.data ?? []) as {
          quiz_id: string;
          section_id: string;
          answered: number;
          question_count: number;
          updated_at: string;
        }[]
      ).map((x) => ({
        quizId: x.quiz_id,
        sectionId: x.section_id,
        answered: x.answered,
        questionCount: x.question_count,
        updatedAt: x.updated_at,
      }));
    },
  };
}

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
