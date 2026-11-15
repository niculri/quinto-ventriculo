// Tests of what each key does on a question of a test.
import { answerChoice, skip, startRound } from '@qv/quiz';
import type { QuestionInfo } from '@qv/quiz';
import type { QuizQuestion } from '@qv/schema';
import { describe, expect, it } from 'vitest';
import { keyAction } from '../keys';

const choice: QuizQuestion = {
  id: 'a',
  kind: 'choice',
  prompt: '¿Cuál?',
  options: ['Una', 'Otra', 'Ninguna'],
  correct: 0,
  figures: [],
  figureBeside: false,
  fixedOrder: false,
};
const short: QuizQuestion = {
  id: 'b',
  kind: 'short',
  prompt: '¿Y esta?',
  answer: 'Así',
  figures: [],
  figureBeside: false,
};
const infos: QuestionInfo[] = [{ id: 'a', options: 3, correct: 0, fixedOrder: false }, { id: 'b' }];
const round = () => startRound(infos, { shuffle: false, shuffleOptions: false });
const key = (k: string, onButton = false) => ({ key: k, onButton });

describe('the keys of a question', () => {
  it('numbers answer in the order on screen, only up to the alternatives', () => {
    const r = { ...round(), orders: [[2, 0, 1]] };
    const state = { round: r, question: choice, revealed: false };
    expect(keyAction(key('1'), state)).toEqual({ kind: 'answer', original: 2 });
    expect(keyAction(key('3'), state)).toEqual({ kind: 'answer', original: 1 });
    expect(keyAction(key('4'), state)).toBeNull();
    expect(keyAction(key('7'), state)).toBeNull();
    expect(keyAction(key(' '), state)).toBeNull();
  });

  it('S skips while it can; Enter goes on once answered, and before that is the button’s', () => {
    const r = round();
    const state = { round: r, question: choice, revealed: false };
    expect(keyAction(key('s'), state)).toEqual({ kind: 'skip' });
    expect(keyAction(key('S'), state)).toEqual({ kind: 'skip' });
    expect(keyAction(key('Enter'), state)).toEqual({ kind: 'none' });
    expect(keyAction(key('Enter', true), state)).toBeNull();
    const answered = answerChoice(r, infos[0]!, 0);
    const done = { round: answered, question: choice, revealed: false };
    expect(keyAction(key('Enter', true), done)).toEqual({ kind: 'next' });
    expect(keyAction(key('2'), done)).toBeNull();
    expect(keyAction(key('s'), done)).toBeNull();
  });

  it('a short answer: Space or Enter show it, then 1 or 2 say whether it was known', () => {
    const r = skip(round());
    const hidden = { round: r, question: short, revealed: false };
    expect(keyAction(key(' '), hidden)).toEqual({ kind: 'reveal' });
    expect(keyAction(key('Enter'), hidden)).toEqual({ kind: 'reveal' });
    expect(keyAction(key('1'), hidden)).toBeNull();
    const shown = { ...hidden, revealed: true };
    expect(keyAction(key(' '), shown)).toBeNull();
    expect(keyAction(key('Enter'), shown)).toEqual({ kind: 'none' });
    expect(keyAction(key('1'), shown)).toEqual({ kind: 'selfAssess', knewIt: true });
    expect(keyAction(key('2'), shown)).toEqual({ kind: 'selfAssess', knewIt: false });
    expect(keyAction(key('3'), shown)).toBeNull();
  });
});
