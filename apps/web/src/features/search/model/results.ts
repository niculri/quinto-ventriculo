// A search's results grouped by note, the link of each one, and where a search was made from.
import type { Catalog, SearchContext, SearchResult } from '@qv/schema';
import { paths } from '../../../shared/lib/paths';
import { locateNote } from '../../catalog/model/catalog';

export interface ResultGroup {
  noteId: string;
  noteSlug: string;
  noteTitle: string;
  courseName: string;
  sections: SearchResult[];
}

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

/** The semester and the course come from the catalog; until it arrives, the old form, which redirects. */
export function resultLink(
  r: Pick<SearchResult, 'noteId' | 'noteSlug' | 'anchor'>,
  catalog: Catalog | undefined,
): string {
  const found = catalog ? locateNote(catalog, 'id', r.noteId) : null;
  return found
    ? paths.note(found.course, found.note.slug, r.anchor)
    : paths.legacyNote(r.noteSlug, r.anchor);
}

export function searchContext(pathname: string): SearchContext {
  if (pathname === '/home') return 'home';
  if (pathname === '/search') return 'search';
  if (/\/notes\/[^/]+/.test(pathname)) return 'note';
  if (/\/courses\/[^/]+\/anki(\/|$)/.test(pathname)) return 'deck';
  if (/\/courses\/[^/]+\/tests\//.test(pathname)) return 'quiz';
  if (
    /^\/semesters\/\d+(\/courses\/[^/]+(\/assessments\/[^/]+\/(notes|tests))?)?$/.test(pathname)
  ) {
    return 'course';
  }
  return 'other';
}
