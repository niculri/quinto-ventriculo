import { describe, expect, it } from 'vitest';
import { answerScreenBack, isAnswerScreen } from './answerScreen';

const DECK = '/semesters/1/courses/anatomia-1/anki/certamen-1/s1-semana/mazo';

describe('the screens where one answers', () => {
  it('are studying, a final review and practicing; nothing else', () => {
    expect(isAnswerScreen(`${DECK}/study`)).toBe(true);
    expect(isAnswerScreen('/semesters/1/courses/anatomia-1/anki/certamen-1/review')).toBe(true);
    expect(isAnswerScreen('/semesters/1/courses/anatomia-1/anki/certamen-1/cards/practice')).toBe(
      true,
    );
    expect(isAnswerScreen(DECK)).toBe(false);
    expect(isAnswerScreen('/semesters/1/courses/anatomia-1/anki/certamen-1/cards')).toBe(false);
    expect(isAnswerScreen('/home')).toBe(false);
  });

  it('«Volver» before the deck is known goes to the page they were opened from', () => {
    expect(answerScreenBack(`${DECK}/study`, '?x=1')).toEqual({ to: DECK, label: 'Anki' });
    expect(answerScreenBack('/semesters/1/courses/anatomia-1/anki/certamen-1/review', '')).toEqual({
      to: '/semesters/1/courses/anatomia-1/anki/certamen-1',
      label: 'Anki',
    });
    // Practicing keeps the filters of the list it came from.
    expect(
      answerScreenBack(
        '/semesters/1/courses/anatomia-1/anki/certamen-1/cards/practice',
        '?state=failed',
      ),
    ).toEqual({
      to: '/semesters/1/courses/anatomia-1/anki/certamen-1/cards?state=failed',
      label: 'Tarjetas',
    });
    expect(answerScreenBack('/home', '')).toBeNull();
  });
});
