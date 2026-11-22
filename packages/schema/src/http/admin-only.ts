// What an administrator sees in the admin mode that a student does not, and why: the draft, a semester hidden for being
// empty and a course turned off. It is computed against what the student gets from the published catalog.
import { withoutEmptySemesters } from './api';
import type {
  AdminReason,
  AssessmentWithNotes,
  Catalog,
  CourseWithAssessments,
  SiteSettings,
} from './api';
import { withoutCourses } from './visibility';

export type AdminKind = 'semester' | 'course' | 'assessment' | 'note' | 'quiz' | 'deck';

/** The key of a thing in `Catalog.adminOnly`. */
export const adminKey = (kind: AdminKind, id: string | number) => `${kind}:${id}`;

const ORDER: AdminReason[] = ['draft', 'hiddenSemester', 'hiddenCourse'];

const materialOf = (a: AssessmentWithNotes) => a.notes.length + a.quizzes.length + a.cardCount;
const materialOfCourse = (c: CourseWithAssessments) =>
  c.assessments.reduce((n, a) => n + materialOf(a), 0);

/** What the published catalog has, to tell what the draft adds. */
interface Published {
  courses: Map<string, number>;
  assessments: Map<string, number>;
  notes: Set<string>;
  quizzes: Set<string>;
  decks: Map<string, number>;
}

function indexPublished(published: Catalog): Published {
  const courses = published.semesters.flatMap((s) => s.courses);
  const assessments = courses.flatMap((c) => c.assessments);
  return {
    courses: new Map(courses.map((c) => [c.id, materialOfCourse(c)])),
    assessments: new Map(assessments.map((a) => [a.id, materialOf(a)])),
    notes: new Set(assessments.flatMap((a) => a.notes.map((n) => n.id))),
    quizzes: new Set(assessments.flatMap((a) => a.quizzes.map((q) => q.id))),
    decks: new Map(published.anki.decks.map((d) => [d.id, d.cardCount])),
  };
}

interface Context {
  before: Published;
  hidden: ReadonlySet<string>;
  seenSemesters: ReadonlySet<number>;
  out: Record<string, AdminReason[]>;
}

/** The reasons it takes from what holds it: a semester a student does not see, a course turned off. */
function inherited(ctx: Context, semester: number | null, course: string | null) {
  const reasons = new Set<AdminReason>();
  if (semester !== null && !ctx.seenSemesters.has(semester)) reasons.add('hiddenSemester');
  if (course !== null && ctx.hidden.has(course)) reasons.add('hiddenCourse');
  return reasons;
}

function mark(
  ctx: Context,
  kind: AdminKind,
  id: string | number,
  reasons: Set<AdminReason>,
  isDraft = false,
) {
  if (isDraft) reasons.add('draft');
  if (reasons.size) ctx.out[adminKey(kind, id)] = ORDER.filter((r) => reasons.has(r));
}

function markAssessment(
  ctx: Context,
  semester: number,
  course: string,
  a: AssessmentWithNotes,
): void {
  const held = () => inherited(ctx, semester, course);
  mark(ctx, 'assessment', a.id, held(), materialOf(a) > 0 && !ctx.before.assessments.get(a.id));
  for (const n of a.notes) mark(ctx, 'note', n.id, held(), !ctx.before.notes.has(n.id));
  for (const q of a.quizzes) mark(ctx, 'quiz', q.id, held(), !ctx.before.quizzes.has(q.id));
}

/**
 * The catalog of the admin mode (`draft`: the draft with nothing taken out) with `adminOnly`. A thing is `draft` if
 * the published catalog does not have it (an assessment, a course or a deck: has no material there), and it inherits
 * the reasons of what holds it: a course turned off, a semester a student does not see.
 */
export function markAdminOnly(
  draft: Catalog,
  published: Catalog,
  settings: Pick<SiteSettings, 'hideEmptySemesters' | 'hiddenCourses'>,
): Catalog {
  const hidden = new Set(settings.hiddenCourses);
  const withoutOff = withoutCourses(published, hidden);
  const seen = settings.hideEmptySemesters ? withoutEmptySemesters(withoutOff) : withoutOff;
  const publishedSemesters = new Set(published.semesters.map((s) => s.number));
  const ctx: Context = {
    before: indexPublished(published),
    hidden,
    // A semester only the draft has is not hidden from the students: it is not there yet.
    seenSemesters: new Set([
      ...seen.semesters.map((s) => s.number),
      ...draft.semesters.map((s) => s.number).filter((n) => !publishedSemesters.has(n)),
    ]),
    out: {},
  };
  for (const s of draft.semesters) {
    mark(
      ctx,
      'semester',
      s.number,
      inherited(ctx, s.number, null),
      !publishedSemesters.has(s.number),
    );
    for (const c of s.courses) {
      const isDraft = materialOfCourse(c) > 0 && !ctx.before.courses.get(c.id);
      mark(ctx, 'course', c.id, inherited(ctx, s.number, c.id), isDraft);
      for (const a of c.assessments) markAssessment(ctx, s.number, c.id, a);
    }
  }
  for (const d of draft.anki.decks) {
    const isDraft = d.cardCount > 0 && !ctx.before.decks.get(d.id);
    mark(ctx, 'deck', d.id, inherited(ctx, d.semester, d.courseId), isDraft);
  }
  return { ...draft, adminOnly: ctx.out };
}
