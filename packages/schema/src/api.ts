import { z } from 'zod';
import { Assessment, Course, NoteSummary, Semester } from './content';
import { AnkiTreeDeck, AuthorPreset, NoteTypeSummary } from './flashcards';
import { CardIndexRef } from './browse-index';
import { QuizSummary } from './quizzes';

/** API contracts (`/api/*`). The web validates every response with these schemas. */

/**
 * An assessment with its notes, its practice tests and how many Anki cards it has (its decks are in `anki`).
 * `quizzes` defaults to empty: a catalog from before v1.4 still parses.
 */
export const AssessmentWithNotes = Assessment.extend({
  notes: z.array(NoteSummary),
  quizzes: z.array(QuizSummary).default([]),
  cardCount: z.number().int().nonnegative().default(0),
  /**
   * The current file of the card browser's index (step 3.3): `cardIndexUrl(id, hash)`. Absent: the assessment has no
   * cards, or it was not imported again since that step (or its deck was taken off the site).
   */
  cardIndex: CardIndexRef.optional(),
});
export const CourseWithAssessments = Course.extend({ assessments: z.array(AssessmentWithNotes) });
export const SemesterWithCourses = Semester.extend({ courses: z.array(CourseWithAssessments) });

/** The whole Anki deck tree (parents before children), the author's presets and the note types. */
export const AnkiCatalog = z.object({
  decks: z.array(AnkiTreeDeck),
  presets: z.array(AuthorPreset),
  noteTypes: z.array(NoteTypeSummary),
});
export type AnkiCatalog = z.infer<typeof AnkiCatalog>;

/**
 * `anki` defaults to empty: a catalog from before v1.3 that a browser still has cached (the API lets it keep
 * one for a minute) still parses, without decks, until the next request.
 */
export const Catalog = z.object({
  semesters: z.array(SemesterWithCourses),
  anki: AnkiCatalog.default({ decks: [], presets: [], noteTypes: [] }),
  /**
   * How many semesters the site hides because they have no material yet (the administrator's switch, step 1.8):
   * where they would be, the web says that they are coming. Absent when none is hidden.
   */
  hiddenSemesters: z.number().int().positive().optional(),
});
export type Catalog = z.infer<typeof Catalog>;
export type SemesterWithCourses = z.infer<typeof SemesterWithCourses>;
export type CourseWithAssessments = z.infer<typeof CourseWithAssessments>;
export type AssessmentWithNotes = z.infer<typeof AssessmentWithNotes>;

export const SearchResult = z.object({
  noteId: z.string(),
  noteSlug: z.string(),
  noteTitle: z.string(),
  courseName: z.string(),
  anchor: z.string(),
  section: z.string(),
  /** Plain-text snippet with the matches between «⟦» and «⟧» (the web highlights them). */
  snippet: z.string(),
  score: z.number(),
});
export type SearchResult = z.infer<typeof SearchResult>;

export const SearchResponse = z.object({
  query: z.string(),
  results: z.array(SearchResult),
});
export type SearchResponse = z.infer<typeof SearchResponse>;

export const ApiError = z.object({ error: z.string(), message: z.string() });
export type ApiError = z.infer<typeof ApiError>;

/** Markers of the search snippet. They are characters that never appear in the notes. */
export const HIGHLIGHT_START = '⟦';
export const HIGHLIGHT_END = '⟧';

/**
 * How the site is shown, set from the administration panel (step 1.8). It is not material: it changes at once, without
 * going through the draft. `updatedAt` and `updatedBy` are null until somebody changes it for the first time.
 */
export const SiteSettings = z.object({
  /** The semesters without any published article, deck or test are not shown (nor open by their URL). */
  hideEmptySemesters: z.boolean(),
  updatedAt: z.iso.datetime({ offset: true }).nullable(),
  updatedBy: z.string().nullable(),
});
export type SiteSettings = z.infer<typeof SiteSettings>;

/** What the panel sends to change the settings. */
export const SiteSettingsUpdate = z.object({ hideEmptySemesters: z.boolean() }).strict();
export type SiteSettingsUpdate = z.infer<typeof SiteSettingsUpdate>;

/** What `npm run unpublish` takes off (step 1.5). */
export const UnpublishedKind = z.enum(['note', 'deck', 'quiz', 'image']);
export type UnpublishedKind = z.infer<typeof UnpublishedKind>;

/**
 * A piece taken off the site (step 1.5), as the record of the content database keeps it, for «Fuera del sitio» in
 * the administration panel (step 2.10). `removed`: what went with it (an article and its sections, a test and its
 * questions, the decks below and their cards, or the pieces that used an image). `onSite`: published again (imported
 * after `--restore`); null if it could not be told.
 */
export const UnpublishedEntry = z.object({
  id: z.number().int(),
  kind: UnpublishedKind,
  itemId: z.string(),
  title: z.string().nullable(),
  reason: z.string(),
  by: z.string(),
  doneAt: z.iso.datetime({ offset: true }),
  removed: z
    .object({
      notes: z.number().int(),
      sections: z.number().int(),
      quizzes: z.number().int(),
      questions: z.number().int(),
      decks: z.number().int(),
      ankiNotes: z.number().int(),
      cards: z.number().int(),
      staleNotes: z.number().int(),
      assessments: z.array(z.string()),
      usedBy: z.array(z.object({ kind: z.string(), id: z.string(), title: z.string().nullable() })),
    })
    .partial(),
  onSite: z.boolean().nullable(),
});
export type UnpublishedEntry = z.infer<typeof UnpublishedEntry>;

/** The latest entries of the record (at most 200), newest first, and how many there are in all. */
export const UnpublishedLog = z.object({
  total: z.number().int().nonnegative(),
  entries: z.array(UnpublishedEntry),
});
export type UnpublishedLog = z.infer<typeof UnpublishedLog>;

/** A semester has material when one of its courses has an article, a test or an Anki deck with cards. */
export function semesterHasMaterial(catalog: Catalog, semester: SemesterWithCourses): boolean {
  return (
    semester.courses.some((c) =>
      c.assessments.some((a) => a.notes.length > 0 || a.quizzes.length > 0),
    ) || catalog.anki.decks.some((d) => d.semester === semester.number && d.cardCount > 0)
  );
}

/**
 * The catalog without the semesters that have no material (the administrator's switch, step 1.8), and how many went
 * (`hiddenSemesters`). The Anki decks of a hidden semester (empty parents) go too. Nothing else changes.
 */
export function withoutEmptySemesters(catalog: Catalog): Catalog {
  const hidden = new Set(
    catalog.semesters.filter((s) => !semesterHasMaterial(catalog, s)).map((s) => s.number),
  );
  if (!hidden.size) return catalog;
  return {
    ...catalog,
    semesters: catalog.semesters.filter((s) => !hidden.has(s.number)),
    anki: {
      ...catalog.anki,
      decks: catalog.anki.decks.filter((d) => d.semester === null || !hidden.has(d.semester)),
    },
    hiddenSemesters: hidden.size,
  };
}
