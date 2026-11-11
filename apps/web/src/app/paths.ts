/**
 * Every URL of the web, in one place. They follow the hierarchy of the material:
 *
 *   /semesters/2
 *   /semesters/2/courses/biologia-celular
 *   /semesters/2/courses/biologia-celular/assessments/certamen-2/notes   an assessment's notes
 *   /semesters/2/courses/biologia-celular/assessments/certamen-2/tests   its tests
 *   /semesters/2/courses/biologia-celular/notes/11-traduccion#ribosomas
 *   /semesters/2/courses/biologia-celular/tests/certamen-2/preguntas-de-practica/nuevas   a test's tab
 *   …/tests/certamen-2/preguntas-de-practica/nuevas?topics=04   its cover with a lecture's topics chosen
 *   /semesters/1/courses/anatomia-1/anki            the course's own deck, with every deck below it
 *   /semesters/1/courses/anatomia-1/anki/study      studying the whole course
 *   /semesters/1/courses/anatomia-1/anki/certamen-1/s3-columna-…/01-columna-vertebral/extras
 *   /semesters/1/courses/anatomia-1/anki/certamen-1/s3-columna-…/01-columna-vertebral/study
 *   /semesters/1/courses/anatomia-1/anki/certamen-1/review   the final review of an assessment
 *   /anki/browse?q=deck:"…"&note=…&ord=0            the browser (Anki's «Explorar»), opened from a deck
 *   /settings/account                               «Opciones» → «Datos de usuario» (/settings opens it)
 *   /settings/anki                                  «Opciones» → «Anki general» (every deck)
 *   /settings/deck-options?preset=Default           «Opciones» → «Configuración de mazos» (a preset open)
 *   /admin/releases                                 «Administración» → «Publicaciones» (administrators; /admin opens
 *                                                   it); also /admin/reports, /admin/usage, /admin/access,
 *                                                   /admin/site and /admin/unpublished
 *
 * Anki goes course by course: there is no page with the decks of several courses (the root «() Medicina
 * UCH» and the semesters' decks exist, as in Anki, but are not studied from the web).
 *
 * Nobody builds a route by hand: links, breadcrumbs, search results and redirects call these functions.
 * The old forms (/courses/:id, /notes/:slug, /decks/:id, …/anki/<deck>?subdeck=, …/options, /anki,
 * /semesters/:n/anki) still work: they redirect.
 */

/** What a course link needs: its id and its semester. */
export interface CourseRef {
  id: string;
  semester: number;
}

/**
 * A deck of a course, by where it is: the course and the slugs of the decks below it (none: the course's
 * own deck, whose page is the course's). `features/anki/tree.ts` gives each deck its own.
 */
export interface DeckRef {
  course: CourseRef;
  segments: string[];
}

/** The query of the cards page (features/cards): every part is optional, and an empty one is left out. */
export interface CardsQuery {
  /** The week or lecture: its slugs below the page's deck, with «/». */
  unit?: string | null;
  q?: string | null;
  state?: string | null;
  /** Origin tags, with commas. */
  origin?: string | null;
  /** `text` or `image`. */
  kind?: string | null;
  /** A day of the heatmap, «2026-11-03». */
  day?: string | null;
  /** The card open in the viewer: «<ord>:<guid>». */
  card?: string | null;
  view?: string | null;
}

/** The anchor of an assessment's section on its course's page: «biologia-celular/certamen-2» → «certamen-2». */
export const assessmentAnchor = (assessmentId: string) =>
  assessmentId.split('/').pop() ?? assessmentId;

const seg = encodeURIComponent;

function withQuery(path: string, query?: Record<string, string | null | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v) params.set(k, v);
  const text = params.toString();
  return text ? `${path}?${text}` : path;
}

export const paths = {
  /** The landing page, with `next` (where to go after signing in) or a known `notice`. */
  landing: (query?: { next?: string | null; notice?: string | null }) => withQuery('/', query),
  home: '/home',
  /** Every semester and its courses (step 3.2: «La carrera» left the home page). */
  courses: '/courses',
  /** The privacy policy and the terms of use (step 2.3): public, with or without a session. */
  privacy: '/privacy',
  terms: '/terms',
  /** The license of the code, its source and the third-party licenses (step 2.4): public, like the two above. */
  licenses: '/licenses',
  /** What the site is, who makes it, where its material comes from and the thanks (step 2.7): public too. */
  about: '/about',
  help: '/help',
  search: (query?: string) => withQuery('/search', { q: query?.trim() }),
  semester: (number: number) => `/semesters/${number}`,
  course: (course: CourseRef) => `/semesters/${course.semester}/courses/${seg(course.id)}`,
  /** An assessment, on its course's page (its section: «…#certamen-2»). */
  assessment: (course: CourseRef, assessmentId: string) =>
    `${paths.course(course)}#${assessmentAnchor(assessmentId)}`,
  /** The list of an assessment's notes («Apuntes» on the course's page). */
  assessmentNotes: (course: CourseRef, assessmentId: string) =>
    `${paths.course(course)}/assessments/${seg(assessmentAnchor(assessmentId))}/notes`,
  /** The list of an assessment's tests. */
  assessmentTests: (course: CourseRef, assessmentId: string) =>
    `${paths.course(course)}/assessments/${seg(assessmentAnchor(assessmentId))}/tests`,
  /** A note; `anchor` is the section (the part after «#»). */
  note: (course: CourseRef, noteSlug: string, anchor?: string | null) =>
    `${paths.course(course)}/notes/${seg(noteSlug)}${anchor ? `#${anchor}` : ''}`,
  /**
   * A practice test, under its assessment (its slug is unique there: every assessment can have its
   * «preguntas-de-practica»); `section` is its tab («pautas», «nuevas»). A test with one section has no
   * segment for it. `topics` opens its cover with those groups chosen (`?topics=04,05`: «Ponte a prueba» of
   * an article).
   */
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
  /** A deck's page (no segments: the course's own deck, with every deck below it). */
  deck: (ref: DeckRef) => [`${paths.course(ref.course)}/anki`, ...ref.segments.map(seg)].join('/'),
  /** Studying a deck: it and everything below it, as in Anki. */
  deckStudy: (ref: DeckRef) =>
    [`${paths.course(ref.course)}/anki`, ...ref.segments.map(seg), 'study'].join('/'),
  /** The final review of an assessment: what was already seen, without changing any date. */
  deckReview: (ref: DeckRef) =>
    [`${paths.course(ref.course)}/anki`, ...ref.segments.map(seg), 'review'].join('/'),
  /**
   * The cards of a course or an assessment (step 3.3): the list by lecture and topic, its filters in the query
   * (`unit`, `q`, `state`, `origin`, `kind`, `day`, `card`) and, in «Modo avanzado», `view=table` for Anki's table.
   */
  cards: (ref: DeckRef, query?: CardsQuery) =>
    withQuery(
      [`${paths.course(ref.course)}/anki`, ...ref.segments.map(seg), 'cards'].join('/'),
      query as Record<string, string | null | undefined>,
    ),
  /** «Practicar estas»: a round with those cards (the same query), without changing any date. */
  cardsPractice: (ref: DeckRef, query?: CardsQuery) =>
    withQuery(
      [`${paths.course(ref.course)}/anki`, ...ref.segments.map(seg), 'cards', 'practice'].join('/'),
      query as Record<string, string | null | undefined>,
    ),
  /**
   * Before step 3.3, the browser of every course (`/anki/browse?q=…&note=…&ord=…`): it redirects to the cards of the
   * course or assessment of its search or card.
   */
  browse: (query?: { q?: string | null; note?: string | null; ord?: number | null }) =>
    withQuery('/anki/browse', {
      q: query?.q,
      note: query?.note,
      ord: query?.note && query.ord !== null && query.ord !== undefined ? String(query.ord) : null,
    }),
  /** «Opciones» of the user menu: it opens its first section. */
  settings: '/settings',
  /** «Opciones» → «Datos de usuario». */
  accountSettings: '/settings/account',
  /** «Opciones» → «Mis reportes» (step 2.6): what the student reported and what happened with it. */
  myReports: '/settings/reports',
  /** «Opciones» → «Anki general»: the preferences of every deck. */
  ankiSettings: '/settings/anki',
  /**
   * «Administración» of the user menu (only for administrators, step 2.10): its own page, by sections; it opens the
   * first one.
   */
  admin: '/admin',
  /** «Administración» → «Publicaciones»: what the draft changes, its review list, publishing and the preview. */
  adminReleases: '/admin/releases',
  /** «Administración» → «Reportes»: the errors the students reported. */
  adminReports: '/admin/reports',
  /** «Administración» → «Uso»: how much the site is used, in figures of 5 students or more. */
  adminUsage: '/admin/usage',
  /** «Administración» → «Acceso»: who is invited, inviting and removing. */
  adminAccess: '/admin/access',
  /** «Administración» → «Sitio»: how the site is shown. */
  adminSite: '/admin/site',
  /** «Administración» → «Fuera del sitio»: what was taken off the site, only to look at. */
  adminUnpublished: '/admin/unpublished',
  /**
   * «Opciones» → «Configuración de mazos», with a preset open: an author's by its name, one of the user's by
   * its id; or the one a deck uses (`deck`, the page shows it as `preset`).
   */
  deckOptions: (query?: { preset?: string | null; deck?: string | null }) =>
    withQuery('/settings/deck-options', { preset: query?.preset, deck: query?.deck }),
  /**
   * Old form of a note's link, only when the course is not known yet (the catalog has not arrived): it
   * redirects to the canonical one.
   */
  legacyNote: (noteSlug: string, anchor?: string | null) =>
    `/notes/${seg(noteSlug)}${anchor ? `#${anchor}` : ''}`,
};
