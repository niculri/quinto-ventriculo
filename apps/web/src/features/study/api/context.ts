// The study repository: app/services.tsx provides it; the tests and the admin preview swap it.
import { createContext, useContext } from 'react';
import type { StudyRepository } from './repository';

export const StudyRepositoryContext = createContext<StudyRepository | null>(null);

export function useStudyRepository(): StudyRepository {
  const study = useContext(StudyRepositoryContext);
  if (study === null) throw new Error('useStudyRepository outside <ServicesProvider>');
  return study;
}
