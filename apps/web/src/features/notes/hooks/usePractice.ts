// The test and the deck of a note's «Ponte a prueba», found in its assessment.

import type { Note, QuizSummary } from '@qv/schema';
import { buildAnkiTree } from '../../catalog/model/tree';
import { useCatalog } from '../../catalog/hooks/useCatalog';
import type { NoteLocation } from '../../catalog/model/catalog';
import { findPracticeDeck } from '../model/practice';

export function usePractice(note: Note, location: NoteLocation | null) {
  const catalog = useCatalog();
  const practice = note.practice;
  const quiz: QuizSummary | null = location
    ? ((practice?.quizId
        ? location.assessment.quizzes.find((q) => q.id === practice.quizId)
        : location.assessment.quizzes[0]) ?? null)
    : null;
  const deckName = practice?.deck;
  const deck =
    catalog.data && deckName
      ? findPracticeDeck(buildAnkiTree(catalog.data), note.assessmentId, deckName)
      : null;
  return { quiz, deck, section: quiz ? practice?.section : undefined };
}
