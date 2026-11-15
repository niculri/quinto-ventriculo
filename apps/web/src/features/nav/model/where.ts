// Where in the site a path is, for the menu: the semester, the course, the assessment and the part of it open.
import type { Catalog, CourseWithAssessments, NoteSummary } from '@qv/schema';
import { paths } from '../../../shared/lib/paths';
import { locateNote, noteBlocks } from '../../catalog/model/catalog';
import { courseDeck, hasPage } from '../../catalog/model/tree';
import type { AnkiTree, CourseDeckNode } from '../../catalog/model/tree';

export interface Where {
  semester: number | null;
  courseId: string | null;
  assessmentId: string | null;
  tab: 'notes' | 'tests' | 'anki' | null;
  noteSlug: string | null;
  quizSlug: string | null;
  deckId: string | null;
  settings: boolean;
  admin: boolean;
}

const NOWHERE: Where = {
  semester: null,
  courseId: null,
  assessmentId: null,
  tab: null,
  noteSlug: null,
  quizSlug: null,
  deckId: null,
  settings: false,
  admin: false,
};

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export function locate(pathname: string, catalog: Catalog | null, tree: AnkiTree | null): Where {
  if (pathname.startsWith('/settings')) return { ...NOWHERE, settings: true };
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return { ...NOWHERE, admin: true };
  const m =
    /^\/semesters\/(\d+)(?:\/courses\/([^/]+)(?:\/(notes|tests|anki|assessments)(?:\/(.*))?)?)?\/?$/.exec(
      pathname,
    );
  if (!m) return NOWHERE;
  const where: Where = { ...NOWHERE, semester: Number(m[1]) };
  if (!m[2]) return where;
  const courseId = decode(m[2]);
  where.courseId = courseId;
  const kind = m[3];
  const rest = (m[4] ?? '').split('/').filter(Boolean).map(decode);
  if (kind === 'notes' && rest[0]) {
    where.tab = 'notes';
    where.noteSlug = rest[0];
    where.assessmentId = catalog
      ? (locateNote(catalog, 'slug', rest[0])?.assessment.id ?? null)
      : null;
  } else if (kind === 'tests' && rest[0]) {
    where.tab = 'tests';
    where.assessmentId = `${courseId}/${rest[0]}`;
    where.quizSlug = rest[1] ?? null;
  } else if (kind === 'assessments' && rest[0]) {
    where.assessmentId = `${courseId}/${rest[0]}`;
    where.tab = rest[1] === 'tests' ? 'tests' : 'notes';
  } else if (kind === 'anki') {
    where.tab = 'anki';
    const best = deckAt(pathname, courseId, tree);
    where.deckId = best?.id ?? null;
    where.assessmentId = best?.assessmentId ?? null;
  }
  return where;
}

/** The deck whose page is the longest start of the path (…/study studies that deck). */
function deckAt(pathname: string, courseId: string, tree: AnkiTree | null): CourseDeckNode | null {
  const path = pathname.replace(/\/study\/?$/, '');
  let best: CourseDeckNode | null = null;
  for (const n of tree?.nodes ?? []) {
    if (!hasPage(n) || n.courseId !== courseId) continue;
    const p = paths.deck(n.ref);
    if (
      (path === p || path.startsWith(`${p}/`)) &&
      (!best || p.length > paths.deck(best.ref).length)
    ) {
      best = n;
    }
  }
  return best;
}

export function hasMaterial(course: CourseWithAssessments, tree: AnkiTree | null): boolean {
  return (
    course.assessments.some((a) => a.notes.length || a.quizzes.length) ||
    (tree !== null && courseDeck(tree, course.id) !== null)
  );
}

/**
 * The notes of an assessment: if some note has a week, the same blocks as the assessment's list (a note without a week
 * goes under its kind, not under the last week); else one block in order.
 */
export function menuNoteBlocks(
  notes: readonly NoteSummary[],
): { key: string; title: string | null; notes: readonly NoteSummary[] }[] {
  return notes.some((n) => n.group) ? noteBlocks(notes) : [{ key: 'all', title: null, notes }];
}
