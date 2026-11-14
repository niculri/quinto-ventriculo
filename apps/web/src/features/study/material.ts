// Where a card's material is: the article (and its test) of the deck the card is in.

import { useMemo } from 'react';
import type { Catalog, NoteSummary, QuizSummary } from '@qv/schema';
import { paths } from '../../app/paths';
import { buildAnkiTree, descendants } from '../anki/tree';
import { useCatalog } from '../catalog/queries';
import { findPracticeDeck, practiceLink } from '../notes/Practice';

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
        const practice = note.practice;
        if (!practice?.deck) continue;
        const deck = findPracticeDeck(tree, assessment.id, practice.deck);
        if (!deck) continue;
        const quiz = assessment.quizzes.find((q) => q.id === practice.quizId) ?? null;
        const material: CardMaterial = {
          note,
          notePath: paths.note(course, note.slug),
          quiz,
          quizPath: quiz
            ? practiceLink(course, quiz, practice.section, practice.groups ?? [])
            : null,
        };
        for (const d of descendants(deck)) out.set(d.id, material);
      }
    }
  }
  return out;
}

export function useCardMaterial(deckId: string | undefined): CardMaterial | null {
  const catalog = useCatalog();
  const map = useMemo(() => (catalog.data ? materialByDeck(catalog.data) : null), [catalog.data]);
  return (deckId && map?.get(deckId)) || null;
}
