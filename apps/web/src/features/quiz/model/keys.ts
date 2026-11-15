// What a key does on a question: S skips, Enter goes on (or shows a short answer), Space shows it, 1–6 answer in the
// order on screen, and 1 or 2 say whether a short answer was known.
import { canSkip, isAnswered } from '@qv/quiz';
import type { Round } from '@qv/quiz';
import type { QuizQuestion } from '@qv/schema';

export type QuizKeyAction =
  | { kind: 'skip' }
  | { kind: 'next' }
  | { kind: 'reveal' }
  | { kind: 'none' }
  | { kind: 'answer'; original: number }
  | { kind: 'selfAssess'; knewIt: boolean };

export interface KeyPress {
  key: string;
  /** Before answering, Enter on a focused button is that button's. */
  onButton: boolean;
}

export interface QuestionState {
  round: Round;
  question: QuizQuestion;
  revealed: boolean;
}

function enterAction(press: KeyPress, state: QuestionState, done: boolean): QuizKeyAction | null {
  if (press.onButton && !done) return null;
  if (done) return { kind: 'next' };
  return state.question.kind === 'short' && !state.revealed ? { kind: 'reveal' } : { kind: 'none' };
}

function numberAction(n: number, state: QuestionState): QuizKeyAction | null {
  const { round, question: q, revealed } = state;
  if (q.kind === 'choice') {
    const order = round.orders[round.index] ?? q.options.map((_, i) => i);
    const original = order[n - 1];
    return original === undefined ? null : { kind: 'answer', original };
  }
  return revealed && n <= 2 ? { kind: 'selfAssess', knewIt: n === 1 } : null;
}

/** null: the key is not the test's (nothing happens and the browser keeps it). */
export function keyAction(press: KeyPress, state: QuestionState): QuizKeyAction | null {
  const { round, question: q, revealed } = state;
  const done = isAnswered(round);
  const { key } = press;
  if (key === 's' || key === 'S') return canSkip(round) ? { kind: 'skip' } : null;
  if (key === 'Enter') return enterAction(press, state, done);
  if (key === ' ' && q.kind === 'short' && !done && !revealed) return { kind: 'reveal' };
  const n = Number(key);
  if (done || !(n >= 1 && n <= 6)) return null;
  return numberAction(n, state);
}
