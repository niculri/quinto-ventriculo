// The catalog and a note's article, read through the content API.
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../../shared/hooks/useApi';
import { catalogQuery, noteQuery } from '../api/queries';

export function useCatalog() {
  const api = useApi();
  return useQuery(catalogQuery(api));
}

export function useNote(slug: string) {
  const api = useApi();
  return useQuery(noteQuery(api, slug));
}
