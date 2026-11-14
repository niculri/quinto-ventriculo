// Zod schemas of the student's practice test progress: what is saved per section, the rounds and the answers.
import { z } from 'zod';
import { rpcContract } from '../database/contract';
import type { UsersContracts } from './functions';

/** Has to be @qv/quiz's `RoundOrigin` (a test in the web checks it). */
export const RoundOrigin = z.enum(['cover', 'restart', 'repeat_all', 'repeat_wrong']);

export const SavedSection = z.object({
  preferences: z.unknown(),
  round: z.unknown(),
  updatedAt: z.string(),
});
export type SavedSection = z.infer<typeof SavedSection>;

export const SavedQuiz = z.record(z.string(), SavedSection);
export type SavedQuiz = z.infer<typeof SavedQuiz>;

export const RoundInfo = z.object({
  id: z.string(),
  origin: RoundOrigin,
  questionCount: z.number(),
  shuffled: z.boolean(),
  shuffleOptions: z.boolean(),
  startedAt: z.string(),
  finished: z.boolean(),
});
export type RoundInfo = z.infer<typeof RoundInfo>;

export const AnswerInfo = z.object({
  roundId: z.string(),
  questionId: z.string(),
  position: z.number(),
  chosen: z.number().nullable(),
  correct: z.boolean(),
  answeredAt: z.string(),
});
export type AnswerInfo = z.infer<typeof AnswerInfo>;

export const QuizStep = z.object({
  quizId: z.string(),
  sectionId: z.string(),
  preferences: z.unknown().optional(),
  round: z.unknown(),
  roundInfo: RoundInfo.optional(),
  answer: AnswerInfo.optional(),
});
export type QuizStep = z.infer<typeof QuizStep>;

export const OpenRound = z.object({
  quizId: z.string(),
  sectionId: z.string(),
  answered: z.number(),
  questionCount: z.number(),
  updatedAt: z.string(),
});
export type OpenRound = z.infer<typeof OpenRound>;

export const QUIZ_RPC = {
  save_quiz_progress: rpcContract(
    z.object({ p: QuizStep.extend({ preferences: z.json().optional(), round: z.json() }) }),
    z.null(),
  ),
} satisfies UsersContracts;
