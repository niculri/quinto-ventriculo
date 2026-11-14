// The user's practice test progress in the users database (round and cover choices per section, rounds and answers).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@qv/db-types/users';
import { toJson } from '../../../lib/json';
import type { QuizRepository } from './port';
import { OPEN_ROUNDS } from './model';
import type { SavedQuiz } from './model';

export function supabaseQuizRepository(client: SupabaseClient<Database>): QuizRepository {
  return {
    async load(quizId) {
      const r = await client
        .from('quiz_progress')
        .select('section_id, preferences, round, updated_at')
        .eq('quiz_id', quizId);
      if (r.error) throw new Error(`No se pudo leer tu avance (${r.error.message}).`);
      const out: SavedQuiz = {};
      for (const row of r.data ?? []) {
        out[row.section_id] = {
          preferences: row.preferences,
          round: row.round,
          updatedAt: row.updated_at,
        };
      }
      return out;
    },
    async save(step) {
      const r = await client.rpc('save_quiz_progress', { p: toJson(step) });
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
      return (r.data ?? []).map((x) => ({
        quizId: x.quiz_id,
        sectionId: x.section_id,
        answered: x.answered,
        questionCount: x.question_count,
        updatedAt: x.updated_at,
      }));
    },
  };
}
