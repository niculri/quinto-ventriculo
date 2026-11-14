// The practice test progress domain: what is saved per section, the rounds and the answers.
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

export interface OpenRound {
  quizId: string;
  sectionId: string;
  answered: number;
  questionCount: number;
  updatedAt: string;
}

export const OPEN_ROUNDS = 5;
