// The tests half done, read again on every visit to the home page.

import { useQuery } from '@tanstack/react-query';
import { useQuizRepository } from '../../quiz/api/context';
import { openRoundsQuery } from '../api/queries';

export function useOpenRounds() {
  const quiz = useQuizRepository();
  return useQuery(openRoundsQuery(quiz));
}
