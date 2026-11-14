// The catalog query and the helpers that find notes, courses and decks in it.
import { useQuery } from '@tanstack/react-query';
import type {
  AssessmentWithNotes,
  Catalog,
  CourseWithAssessments,
  NoteKind,
  NoteSummary,
  SemesterWithCourses,
} from '@qv/schema';
import { useApi } from '../../shared/hooks/useApi';

export function useCatalog() {
  const api = useApi();
  return useQuery({
    queryKey: ['catalog'],
    queryFn: ({ signal }) => api.catalog(signal),
    staleTime: 5 * 60_000,
  });
}

export function useNote(slug: string) {
  const api = useApi();
  return useQuery({
    queryKey: ['note', slug],
    queryFn: ({ signal }) => api.note(slug, signal),
    // Image URLs last at least one hour; 10 minutes so that a piece taken off the site stops showing soon.
    staleTime: 10 * 60_000,
    gcTime: 45 * 60_000,
  });
}

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
      !(d.parentId && (own.get(d.parentId) ?? 0) > 0),
  ).length;
}

export function materialLabel(notes: number, decks: number): string {
  return [
    notes ? `${notes} ${notes === 1 ? 'apunte' : 'apuntes'}` : '',
    decks ? `${decks} ${decks === 1 ? 'mazo' : 'mazos'}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

export function yearOfSemester(number: number): number {
  return Math.ceil(number / 2);
}

export const MORE_SEMESTERS_SOON = 'Los próximos semestres vienen pronto.';

const KIND_BLOCKS: { kind: NoteKind; title: string }[] = [
  { kind: 'lecture', title: 'Clases' },
  { kind: 'seminar', title: 'Seminarios' },
  { kind: 'practical', title: 'Prácticos' },
  { kind: 'summary', title: 'Resúmenes' },
];

/** First the groups (weeks), in the order of their first note; then the notes without a group, by kind. */
export function noteBlocks(
  notes: readonly NoteSummary[],
): { key: string; title: string; notes: NoteSummary[] }[] {
  const groups: { key: string; title: string; notes: NoteSummary[] }[] = [];
  for (const n of notes) {
    if (!n.group) continue;
    const last = groups.at(-1);
    if (last && last.title === n.group) last.notes.push(n);
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
