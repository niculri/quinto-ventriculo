// What a question says once answered: right or wrong (with the letter of the right one), or known or to review.
import { LETTERS } from '@qv/quiz';
import type { QuizQuestion } from '@qv/schema';
import { verdictStrings as s } from './strings/verdict.strings';

export interface Verdict {
  good: boolean;
  text: string;
}

export function verdictOf(
  question: QuizQuestion,
  answer: { correct: boolean } | null,
  order: number[],
): Verdict | null {
  if (!answer) return null;
  if (question.kind === 'choice') {
    return answer.correct
      ? { good: true, text: s.verdict.right }
      : { good: false, text: s.verdict.wrong(LETTERS[order.indexOf(question.correct)]!) };
  }
  return answer.correct
    ? { good: true, text: s.verdict.knew }
    : { good: false, text: s.verdict.review };
}
