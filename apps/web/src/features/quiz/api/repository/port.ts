// The port of the practice test progress: what the Supabase adapter and the in-memory repository implement.
import type { OpenRound, QuizStep, SavedQuiz } from './model';

export interface QuizRepository {
  load(quizId: string): Promise<SavedQuiz>;
  save(step: QuizStep): Promise<void>;
  openRounds(): Promise<OpenRound[]>;
}
