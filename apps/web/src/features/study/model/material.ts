// Where a card's material is: the article (and its test) of the deck the card is in.

import type { Catalog, CourseWithAssessments, NoteSummary, QuizSummary } from '@qv/schema';
import { paths } from '../../../shared/lib/paths';
import { buildAnkiTree, descendants } from '../../catalog/model/tree';
import type { AnkiTree, DeckNode } from '../../catalog/model/tree';
import { findPracticeDeck, practiceLink } from '../../notes/Practice';

export interface CardMaterial {
  note: NoteSummary;
  notePath: string;
  quiz: QuizSummary | null;
  quizPath: string | null;
}

export function materialByDeck(catalog: Catalog): Map<string, CardMaterial> {
  const tree = buildAnkiTree(catalog);
  const out = new Map<string, CardMaterial>();
  for (const course of catalog.semesters.flatMap((s) => s.courses)) {
    for (const assessment of course.assessments) {
      for (const note of assessment.notes) {
        const found = materialOf(tree, course, assessment, note);
        if (found) for (const d of descendants(found.deck)) out.set(d.id, found.material);
      }
    }
  }
  return out;
}

// A note's practice deck in the tree and what its cards link to, if the note has one.
function materialOf(
  tree: AnkiTree,
  course: CourseWithAssessments,
  assessment: CourseWithAssessments['assessments'][number],
  note: NoteSummary,
): { deck: DeckNode; material: CardMaterial } | null {
  const practice = note.practice;
  if (!practice?.deck) return null;
  const deck = findPracticeDeck(tree, assessment.id, practice.deck);
  if (!deck) return null;
  const quiz = assessment.quizzes.find((q) => q.id === practice.quizId) ?? null;
  const material: CardMaterial = {
    note,
    notePath: paths.note(course, note.slug),
    quiz,
    quizPath: quiz ? practiceLink(course, quiz, practice.section, practice.groups ?? []) : null,
  };
  return { deck, material };
}
