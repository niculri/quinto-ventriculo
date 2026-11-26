// The repository of what was read of the announcements: app/ServicesProvider.tsx provides it; the tests swap it.
import { createContext, use } from 'react';
import type { NewsRepository } from './repository';

export const NewsRepositoryContext = createContext<NewsRepository | null>(null);

export function useNewsRepository(): NewsRepository {
  const news = use(NewsRepositoryContext);
  if (news === null) throw new Error('useNewsRepository outside <ServicesProvider>');
  return news;
}
