// What an administrator sees in the admin mode that a student does not, and why: the draft, a semester hidden for being
// empty and a course turned off. It is computed against what the student gets from the published catalog.
import { withoutEmptySemesters } from './api';
import type { AdminReason, AssessmentWithNotes, Catalog, SiteSettings } from './api';
import { withoutCourses } from './visibility';

export type AdminKind = 'semester' | 'course' | 'assessment' | 'note' | 'quiz' | 'deck';

/** The key of a thing in `Catalog.adminOnly`. */
export const adminKey = (kind: AdminKind, id: string | number) => `${kind}:${id}`;

const ORDER: AdminReason[] = ['draft', 'hiddenSemester', 'hiddenCourse'];

const materialOf = (a: AssessmentWithNotes) => a.notes.length + a.quizzes.length + a.cardCount;

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
  const seenSemesters = new Set(seen.semesters.map((s) => s.number));

  const publishedAssessments = new Map<string, number>();
  const publishedCourses = new Map<string, number>();
  const publishedNotes = new Set<string>();
  const publishedQuizzes = new Set<string>();
  for (const c of published.semesters.flatMap((s) => s.courses)) {
    let total = 0;
    for (const a of c.assessments) {
      publishedAssessments.set(a.id, materialOf(a));
      total += materialOf(a);
      for (const n of a.notes) publishedNotes.add(n.id);
      for (const q of a.quizzes) publishedQuizzes.add(q.id);
    }
    publishedCourses.set(c.id, total);
  }
  const publishedDecks = new Map(published.anki.decks.map((d) => [d.id, d.cardCount]));

  const out: Record<string, AdminReason[]> = {};
  const mark = (kind: AdminKind, id: string | number, reasons: Set<AdminReason>) => {
    if (reasons.size) out[adminKey(kind, id)] = ORDER.filter((r) => reasons.has(r));
  };
  const inherited = (semester: number | null, course: string | null) => {
    const reasons = new Set<AdminReason>();
    if (semester !== null && !seenSemesters.has(semester)) reasons.add('hiddenSemester');
    if (course !== null && hidden.has(course)) reasons.add('hiddenCourse');
    return reasons;
  };
  const withDraft = (reasons: Set<AdminReason>, isDraft: boolean) =>
    isDraft ? reasons.add('draft') : reasons;

  for (const s of draft.semesters) {
    mark('semester', s.number, inherited(s.number, null));
    for (const c of s.courses) {
      const own = c.assessments.reduce((n, a) => n + materialOf(a), 0);
      mark(
        'course',
        c.id,
        withDraft(inherited(s.number, c.id), own > 0 && !publishedCourses.get(c.id)),
      );
      for (const a of c.assessments) {
        mark(
          'assessment',
          a.id,
          withDraft(
            inherited(s.number, c.id),
            materialOf(a) > 0 && !publishedAssessments.get(a.id),
          ),
        );
        for (const n of a.notes) {
          mark('note', n.id, withDraft(inherited(s.number, c.id), !publishedNotes.has(n.id)));
        }
        for (const q of a.quizzes) {
          mark('quiz', q.id, withDraft(inherited(s.number, c.id), !publishedQuizzes.has(q.id)));
        }
      }
    }
  }
  for (const d of draft.anki.decks) {
    mark(
      'deck',
      d.id,
      withDraft(inherited(d.semester, d.courseId), d.cardCount > 0 && !publishedDecks.get(d.id)),
    );
  }
  return { ...draft, adminOnly: out };
}
