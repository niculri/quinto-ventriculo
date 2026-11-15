// The search while typing: the text debounced, and its results once it has two letters.
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../../shared/hooks/useApi';
import { useDebounced } from '../../../shared/hooks/useDebounced';
import { searchQuery } from '../api/queries';

export function useSearch(query: string, limit = 20) {
  const api = useApi();
  const q = useDebounced(query.trim(), 220);
  const active = q.length >= 2;
  const r = useQuery(searchQuery(api, q, limit));
  return { ...r, active, query: q, results: active ? (r.data?.results ?? []) : [] };
}
