import type {
  AnkiCatalog,
  Assessment,
  CardIndexRecord,
  Catalog,
  Course,
  NoteSummary,
  QuizSummary,
  Semester,
} from '@qv/schema';

/**
 * Nests semesters → courses → assessments → notes and practice tests, each level sorted, and adds the Anki
 * deck tree.
 */
export function buildCatalog(
  semesters: Semester[],
  courses: Course[],
  assessments: Assessment[],
  notes: NoteSummary[],
  anki: AnkiCatalog = { decks: [], presets: [], noteTypes: [] },
  quizzes: QuizSummary[] = [],
  /** The card browser's index of each assessment (step 3.3). */
  indexes: CardIndexRecord[] = [],
): Catalog {
  const indexOf = new Map(indexes.map(({ assessmentId, ...ref }) => [assessmentId, ref]));
  const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position;
  // An assessment's cards: those of its deck (the one of the assessment, which holds every other).
  const cards = new Map<string, number>();
  for (const d of anki.decks) {
    if (d.assessmentId)
      cards.set(d.assessmentId, Math.max(cards.get(d.assessmentId) ?? 0, d.cardCount));
  }
  return {
    semesters: [...semesters]
      .sort((a, b) => a.number - b.number)
      .map((s) => ({
        ...s,
        courses: courses
          .filter((c) => c.semester === s.number)
          .sort(byPosition)
          .map((c) => ({
            ...c,
            assessments: assessments
              .filter((a) => a.courseId === c.id)
              .sort(byPosition)
              .map((a) => ({
                ...a,
                notes: notes.filter((n) => n.assessmentId === a.id).sort(byPosition),
                quizzes: quizzes.filter((q) => q.assessmentId === a.id).sort(byPosition),
                cardCount: cards.get(a.id) ?? 0,
                ...(indexOf.has(a.id) ? { cardIndex: indexOf.get(a.id)! } : {}),
              })),
          })),
      })),
    anki: {
      // Parents before children, siblings by name (as Anki's deck list).
      decks: [...anki.decks].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
      presets: anki.presets,
      noteTypes: anki.noteTypes,
    },
  };
}
