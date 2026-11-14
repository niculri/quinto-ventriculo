// The practice test repository: app/services.tsx provides it; the tests and the admin preview swap it.
import { createContext, useContext } from 'react';
import type { QuizRepository } from './repository';

export const QuizRepositoryContext = createContext<QuizRepository | null>(null);

export function useQuizRepository(): QuizRepository {
  const quiz = useContext(QuizRepositoryContext);
  if (quiz === null) throw new Error('useQuizRepository outside <ServicesProvider>');
  return quiz;
}
