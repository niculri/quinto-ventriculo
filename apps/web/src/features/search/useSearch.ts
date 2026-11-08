import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { Catalog, SearchResult } from '@qv/schema';
import { paths } from '../../app/paths';
import { locateNote } from '../catalog/queries';
import { useServices } from '../../app/services';

export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** Searches while typing: waits for the query to settle and keeps the previous results. */
export function useSearch(query: string, limit = 20) {
  const { api } = useServices();
  const q = useDebounced(query.trim(), 220);
  const active = q.length >= 2;
  const r = useQuery({
    queryKey: ['search', q, limit],
    queryFn: ({ signal }) => api.search(q, limit, signal),
    enabled: active,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
  return { ...r, active, query: q, results: active ? (r.data?.results ?? []) : [] };
}

export interface ResultGroup {
  noteId: string;
  noteSlug: string;
  noteTitle: string;
  courseName: string;
  sections: SearchResult[];
}

/** Groups by note, in the order of each one's best result. */
export function groupByNote(results: SearchResult[]): ResultGroup[] {
  const groups = new Map<string, ResultGroup>();
  for (const r of results) {
    const g = groups.get(r.noteId) ?? {
      noteId: r.noteId,
      noteSlug: r.noteSlug,
      noteTitle: r.noteTitle,
      courseName: r.courseName,
      sections: [],
    };
    g.sections.push(r);
    groups.set(r.noteId, g);
  }
  return [...groups.values()];
}

/**
 * Link to a result: the semester and the course come from the catalog. Without it (it has not arrived yet),
 * the old form, which redirects to the canonical URL.
 */
export function resultLink(
  r: Pick<SearchResult, 'noteId' | 'noteSlug' | 'anchor'>,
  catalog: Catalog | undefined,
): string {
  const found = catalog ? locateNote(catalog, 'id', r.noteId) : null;
  return found
    ? paths.note(found.course, found.note.slug, r.anchor)
    : paths.legacyNote(r.noteSlug, r.anchor);
}
