// The practice test progress: its domain, the port, the Supabase adapter and the in-memory repository.
export { OPEN_ROUNDS } from './model';
export type { AnswerInfo, QuizStep, RoundInfo, SavedQuiz, SavedSection } from './model';
export type { QuizRepository } from './port';
export { supabaseQuizRepository } from './supabase';
export { localQuizRepository } from './memory';
