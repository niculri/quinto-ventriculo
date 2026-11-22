// The rows of the notes and the tests of the content database as the API's summaries.
import type { Database } from '@qv/db-types/content';
import { QuizSummary } from '@qv/schema';

type Tables = Database['public']['Tables'];

// `group` is an SQL keyword, so it is renamed rather than relying on PostgREST quoting it.
export const SUMMARY_COLUMNS =
  'id, slug, course_id, assessment_id, kind, title, subtitle, position, updated_at, code, version, published_at, version_at, header:document->header, practice:document->practice, note_group:document->group';
export const NOTE_COLUMNS =
  'id, slug, course_id, assessment_id, kind, title, subtitle, position, updated_at, code, version, published_at, version_at, document';

/** The columns of a note's summary, with what its `document` adds. */
type NoteSummaryRow = Omit<Tables['notes']['Row'], 'document' | 'hash' | 'version_hash'> & {
  header?: unknown;
  practice?: unknown;
  note_group?: unknown;
};

const iso = (t: string) => new Date(t).toISOString();

export function summary(r: NoteSummaryRow) {
  return {
    id: r.id,
    slug: r.slug,
    courseId: r.course_id,
    assessmentId: r.assessment_id,
    kind: r.kind,
    title: r.title,
    ...(r.subtitle ? { subtitle: r.subtitle } : {}),
    position: r.position,
    updatedAt: iso(r.updated_at),
    ...(r.code ? { code: r.code } : {}),
    ...(r.header ? { header: r.header } : {}),
    ...(r.version ? { version: r.version } : {}),
    ...(r.published_at ? { publishedAt: iso(r.published_at) } : {}),
    ...(r.version_at ? { versionAt: iso(r.version_at) } : {}),
    ...(r.practice ? { practice: r.practice } : {}),
    ...(r.note_group ? { group: r.note_group } : {}),
  };
}

type QuizRow = Omit<Tables['quizzes']['Row'], 'document' | 'hash'>;
export const QUIZ_COLUMNS =
  'id, slug, course_id, assessment_id, title, position, question_count, section_count, updated_at';

export function quizSummary(r: QuizRow): QuizSummary {
  return QuizSummary.parse({
    id: r.id,
    slug: r.slug,
    courseId: r.course_id,
    assessmentId: r.assessment_id,
    title: r.title,
    position: r.position,
    questionCount: r.question_count,
    sectionCount: r.section_count,
    updatedAt: new Date(r.updated_at).toISOString(),
  });
}
