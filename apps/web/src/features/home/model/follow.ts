// «Seguir» on the home page: up to two tests half done, or one and the last note opened on this device.

import type { Catalog } from '@qv/schema';
import { paths } from '../../../shared/lib/paths';
import { locateNote } from '../../catalog/model/catalog';
import { followStrings as s } from './strings/follow.strings';

export interface OpenRound {
  quizId: string;
  sectionId: string;
  answered: number;
  questionCount: number;
}

export interface FollowItem {
  key: string;
  kind: 'quiz' | 'note';
  /** The id of the quiz or the note, for what the admin mode says of it. */
  id: string;
  title: string;
  detail: string;
  to: string;
}

function findQuiz(catalog: Catalog, quizId: string) {
  for (const sem of catalog.semesters) {
    for (const course of sem.courses) {
      for (const a of course.assessments) {
        const quiz = a.quizzes.find((q) => q.id === quizId);
        if (quiz) return { course, quiz };
      }
    }
  }
  return null;
}

export function followItems(
  catalog: Catalog,
  rounds: readonly OpenRound[],
  note: string | null,
): FollowItem[] {
  const tests: FollowItem[] = [];
  for (const r of rounds) {
    const found = findQuiz(catalog, r.quizId);
    if (!found) continue;
    tests.push({
      key: `quiz:${r.quizId}:${r.sectionId}`,
      kind: 'quiz',
      id: found.quiz.id,
      title: found.quiz.title,
      detail: s.follow.quiz(r.answered, r.questionCount),
      to: paths.quiz(found.course, found.quiz, found.quiz.sectionCount > 1 ? r.sectionId : null),
    });
    if (tests.length === 2) break;
  }
  const located = note ? locateNote(catalog, 'slug', note) : null;
  const items = located ? tests.slice(0, 1) : tests;
  if (located) {
    items.push({
      key: `note:${located.note.slug}`,
      kind: 'note',
      id: located.note.id,
      title: located.note.title,
      detail: s.follow.note(located.course.name),
      to: paths.note(located.course, located.note.slug),
    });
  }
  return items;
}
