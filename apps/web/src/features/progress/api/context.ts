// The study repository: app/services.tsx provides it; the tests and the admin mode swap it.
import { createContext, use } from 'react';
import type { StudyRepository } from './repository';

export const StudyRepositoryContext = createContext<StudyRepository | null>(null);

export function useStudyRepository(): StudyRepository {
  const study = use(StudyRepositoryContext);
  if (study === null) throw new Error('useStudyRepository outside <ServicesProvider>');
  return study;
}
