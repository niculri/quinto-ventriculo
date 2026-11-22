// Finding notes, courses and decks in the catalog, and counting its material.
import type {
  AssessmentWithNotes,
  Catalog,
  CourseWithAssessments,
  NoteKind,
  NoteSummary,
  SemesterWithCourses,
} from '@qv/schema';
import { catalogStrings as s } from './strings/catalog.strings';

export interface NoteLocation {
  semester: SemesterWithCourses;
  course: CourseWithAssessments;
  assessment: AssessmentWithNotes;
  note: NoteSummary;
  previous: NoteSummary | null;
  next: NoteSummary | null;
}

export function locateNote(c: Catalog, field: 'slug' | 'id', value: string): NoteLocation | null {
  for (const semester of c.semesters) {
    for (const course of semester.courses) {
      for (const assessment of course.assessments) {
        const i = assessment.notes.findIndex((n) => n[field] === value);
        if (i >= 0) {
          return {
            semester,
            course,
            assessment,
            note: assessment.notes[i]!,
            previous: assessment.notes[i - 1] ?? null,
            next: assessment.notes[i + 1] ?? null,
          };
        }
      }
    }
  }
  return null;
}

export function findCourse(c: Catalog, courseId: string) {
  for (const semester of c.semesters) {
    const course = semester.courses.find((x) => x.id === courseId);
    if (course) return { semester, course };
  }
  return null;
}

export function countNotes(course: CourseWithAssessments): number {
  return course.assessments.reduce((t, a) => t + a.notes.length, 0);
}

/** Decks as one counts them: those with cards of their own whose parent has none (a deck and its subdecks are one). */
export function countDecks(catalog: Catalog, courseId: string, assessmentId?: string): number {
  const decks = catalog.anki.decks;
  const own = new Map(decks.map((d) => [d.id, d.cardCount]));
  for (const d of decks) {
    if (d.parentId) own.set(d.parentId, (own.get(d.parentId) ?? 0) - d.cardCount);
  }
  return decks.filter(
    (d) =>
      d.courseId === courseId &&
      (assessmentId === undefined || d.assessmentId === assessmentId) &&
      own.get(d.id)! > 0 &&
      !(d.parentId && own.get(d.parentId)! > 0),
  ).length;
}

export function materialLabel(notes: number, decks: number): string {
  return [notes ? s.notes(notes) : '', decks ? s.decks(decks) : ''].filter(Boolean).join(' · ');
}

export function yearOfSemester(number: number): number {
  return Math.ceil(number / 2);
}

const KIND_BLOCKS: { kind: NoteKind; title: string }[] = [
  { kind: 'lecture', title: s.blocks.lecture },
  { kind: 'seminar', title: s.blocks.seminar },
  { kind: 'practical', title: s.blocks.practical },
  { kind: 'summary', title: s.blocks.summary },
];

/** First the groups (weeks), in the order of their first note; then the notes without a group, by kind. */
export function noteBlocks(
  notes: readonly NoteSummary[],
): { key: string; title: string; notes: NoteSummary[] }[] {
  const groups: { key: string; title: string; notes: NoteSummary[] }[] = [];
  for (const n of notes) {
    if (!n.group) continue;
    const last = groups.at(-1);
    if (last?.title === n.group) last.notes.push(n);
    else groups.push({ key: `group:${groups.length}:${n.group}`, title: n.group, notes: [n] });
  }
  const rest = notes.filter((n) => !n.group);
  return [
    ...groups,
    ...KIND_BLOCKS.map(({ kind, title }) => ({
      key: `kind:${kind}`,
      title,
      notes: rest.filter((n) => n.kind === kind),
    })).filter((b) => b.notes.length),
  ];
}
