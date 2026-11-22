// Every URL of the web, following the hierarchy of the material (semester → course → assessment → note, test, deck).
// Nothing builds a route by hand: links, breadcrumbs, search results and redirects call these functions.

export interface CourseRef {
  id: string;
  semester: number;
}

export interface DeckRef {
  course: CourseRef;
  segments: string[];
}

export interface CardsQuery {
  unit?: string | null;
  q?: string | null;
  state?: string | null;
  origin?: string | null;
  kind?: string | null;
  day?: string | null;
  card?: string | null;
  view?: string | null;
}

export const assessmentAnchor = (assessmentId: string) =>
  assessmentId.slice(assessmentId.lastIndexOf('/') + 1);

const seg = encodeURIComponent;

function withQuery(path: string, query?: Record<string, string | null | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v) params.set(k, v);
  const text = params.toString();
  return text ? `${path}?${text}` : path;
}

export const paths = {
  landing: (query?: { next?: string | null; notice?: string | null }) => withQuery('/', query),
  home: '/home',
  courses: '/courses',
  privacy: '/privacy',
  terms: '/terms',
  licenses: '/licenses',
  about: '/about',
  help: '/help',
  search: (query?: string) => withQuery('/search', { q: query?.trim() }),
  semester: (number: number) => `/semesters/${number}`,
  course: (course: CourseRef) => `/semesters/${course.semester}/courses/${seg(course.id)}`,
  assessment: (course: CourseRef, assessmentId: string) =>
    `${paths.course(course)}#${assessmentAnchor(assessmentId)}`,
  assessmentNotes: (course: CourseRef, assessmentId: string) =>
    `${paths.course(course)}/assessments/${seg(assessmentAnchor(assessmentId))}/notes`,
  assessmentTests: (course: CourseRef, assessmentId: string) =>
    `${paths.course(course)}/assessments/${seg(assessmentAnchor(assessmentId))}/tests`,
  note: (course: CourseRef, noteSlug: string, anchor?: string | null) =>
    `${paths.course(course)}/notes/${seg(noteSlug)}${anchor ? `#${anchor}` : ''}`,
  quiz: (
    course: CourseRef,
    quiz: { assessmentId: string; slug: string },
    section?: string | null,
    topics?: readonly string[] | null,
  ) =>
    withQuery(
      `${paths.course(course)}/tests/${seg(quiz.assessmentId.split('/')[1] ?? '')}/${seg(quiz.slug)}${
        section ? `/${seg(section)}` : ''
      }`,
      { topics: topics?.length ? topics.join(',') : null },
    ),
  deck: (ref: DeckRef) => [`${paths.course(ref.course)}/anki`, ...ref.segments.map(seg)].join('/'),
  deckStudy: (ref: DeckRef) =>
    [`${paths.course(ref.course)}/anki`, ...ref.segments.map(seg), 'study'].join('/'),
  deckReview: (ref: DeckRef) =>
    [`${paths.course(ref.course)}/anki`, ...ref.segments.map(seg), 'review'].join('/'),
  cards: (ref: DeckRef, query?: CardsQuery) =>
    withQuery(
      [`${paths.course(ref.course)}/anki`, ...ref.segments.map(seg), 'cards'].join('/'),
      query as Record<string, string | null | undefined>,
    ),
  cardsPractice: (ref: DeckRef, query?: CardsQuery) =>
    withQuery(
      [`${paths.course(ref.course)}/anki`, ...ref.segments.map(seg), 'cards', 'practice'].join('/'),
      query as Record<string, string | null | undefined>,
    ),
  /** The old browser of every course: it redirects to the cards of the course or assessment of its search or card. */
  browse: (query?: { q?: string | null; note?: string | null; ord?: number | null }) =>
    withQuery('/anki/browse', {
      q: query?.q,
      note: query?.note,
      ord: query?.note && query.ord !== null && query.ord !== undefined ? String(query.ord) : null,
    }),
  settings: '/settings',
  accountSettings: '/settings/account',
  myReports: '/settings/reports',
  ankiSettings: '/settings/anki',
  admin: '/admin',
  adminReleases: '/admin/releases',
  adminReports: '/admin/reports',
  adminUsage: '/admin/usage',
  adminAccess: '/admin/access',
  adminSite: '/admin/site',
  adminUnpublished: '/admin/unpublished',
  deckOptions: (query?: { preset?: string | null; deck?: string | null }) =>
    withQuery('/settings/deck-options', { preset: query?.preset, deck: query?.deck }),
  /** A note's link before the catalog says its course; it redirects to the canonical one. */
  legacyNote: (noteSlug: string, anchor?: string | null) =>
    `/notes/${seg(noteSlug)}${anchor ? `#${anchor}` : ''}`,
};
