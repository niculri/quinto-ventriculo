import type { SupabaseClient } from '@supabase/supabase-js';
import type { RoundOrigin } from '@qv/quiz';

/**
 * Each user's practice tests, in the USERS database (protected with RLS, like the study data): where they go
 * in each section (the round and the cover's choices), and the history of rounds and answers for the
 * statistics. The questions are the author's and come from the API.
 */

/** What is saved of a section: its round (@qv/quiz's, as it is) and the cover's choices. */
export interface SavedSection {
  preferences: unknown;
  round: unknown;
  updatedAt: string;
}

/** Every section of a test with something saved, by section id. */
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

/** One step of a test: what `save_quiz_progress()` saves, atomically. */
export interface QuizStep {
  quizId: string;
  sectionId: string;
  /** The cover's choices; without them, the saved ones stay. */
  preferences?: unknown;
  /** The section's round (null: none, «Descartar»). */
  round: unknown;
  roundInfo?: RoundInfo;
  answer?: AnswerInfo;
}

export interface QuizRepository {
  load(quizId: string): Promise<SavedQuiz>;
  save(step: QuizStep): Promise<void>;
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

/**
 * Demo mode: everything stays in the browser (`qv-demo-quiz`), with the same rules as the database's
 * function (an answer saved once, the replaced round abandoned, the finished one finished).
 */
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
      // full or blocked storage: it stays in memory for this visit
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
  };
}
