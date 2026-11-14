// Zod contracts of the API's responses and requests (`/api/*`); the web validates every response with them.
import { z } from 'zod';
import { Assessment, Course, NoteSummary, Semester } from '../content/content';
import { AnkiTreeDeck, AuthorPreset, NoteTypeSummary } from '../anki/flashcards';
import { CardIndexRef } from '../anki/browse-index';
import { QuizSummary } from '../quiz/quizzes';

/** `quizzes` defaults to empty so that an older catalog still parses. */
export const AssessmentWithNotes = Assessment.extend({
  notes: z.array(NoteSummary),
  quizzes: z.array(QuizSummary).default([]),
  cardCount: z.number().int().nonnegative().default(0),
  cardIndex: CardIndexRef.optional(),
});
export const CourseWithAssessments = Course.extend({ assessments: z.array(AssessmentWithNotes) });
export const SemesterWithCourses = Semester.extend({ courses: z.array(CourseWithAssessments) });

export const AnkiCatalog = z.object({
  decks: z.array(AnkiTreeDeck),
  presets: z.array(AuthorPreset),
  noteTypes: z.array(NoteTypeSummary),
});
export type AnkiCatalog = z.infer<typeof AnkiCatalog>;

/** `anki` defaults to empty so that an older catalog still cached by a browser parses, without decks. */
export const Catalog = z.object({
  semesters: z.array(SemesterWithCourses),
  anki: AnkiCatalog.default({ decks: [], presets: [], noteTypes: [] }),
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

/** Characters that never appear in the notes. */
export const HIGHLIGHT_START = '⟦';
export const HIGHLIGHT_END = '⟧';

/** Not material: it changes at once, without going through the draft. */
export const SiteSettings = z.object({
  hideEmptySemesters: z.boolean(),
  updatedAt: z.iso.datetime({ offset: true }).nullable(),
  updatedBy: z.string().nullable(),
});
export type SiteSettings = z.infer<typeof SiteSettings>;

export const SiteSettingsUpdate = z.object({ hideEmptySemesters: z.boolean() }).strict();
export type SiteSettingsUpdate = z.infer<typeof SiteSettingsUpdate>;

export const UnpublishedKind = z.enum(['note', 'deck', 'quiz', 'image']);
export type UnpublishedKind = z.infer<typeof UnpublishedKind>;

/** `onSite`: published again after `--restore`; null if it could not be told. */
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

export const UnpublishedLog = z.object({
  total: z.number().int().nonnegative(),
  entries: z.array(UnpublishedEntry),
});
export type UnpublishedLog = z.infer<typeof UnpublishedLog>;

export function semesterHasMaterial(catalog: Catalog, semester: SemesterWithCourses): boolean {
  return (
    semester.courses.some((c) =>
      c.assessments.some((a) => a.notes.length > 0 || a.quizzes.length > 0),
    ) || catalog.anki.decks.some((d) => d.semester === semester.number && d.cardCount > 0)
  );
}

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
