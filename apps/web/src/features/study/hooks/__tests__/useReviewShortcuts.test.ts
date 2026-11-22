// Tests the keys of a round of review: what turns the card, what answers and how, and the keys it leaves alone.

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Round } from '@qv/study';
import { useReviewShortcuts } from '../useReviewShortcuts';

const study = vi.hoisted(() => ({
  answerRound: vi.fn((_round: object, rating: string) => ({ answered: rating })),
  revealCard: vi.fn(() => ({ revealed: true })),
}));
vi.mock('@qv/study', () => study);

const CARD = { noteGuid: 'n', ord: 0, deckId: '20' };
const onChange = vi.fn();
const onAnswer = vi.fn();

function round(revealed: boolean) {
  renderHook(() => useReviewShortcuts({ revealed } as Round, CARD, onChange, onAnswer));
}

function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = window) {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
}

beforeEach(() => {
  onChange.mockClear();
  onAnswer.mockClear();
  document.body.innerHTML = '';
});

describe('the keys of a round', () => {
  it.each([' ', 'Enter'])('«%s» turns the card, and turned answers «Bien»', (key) => {
    round(false);
    expect(press(key).defaultPrevented).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith({ revealed: true });
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('with the answer shown, space answers «Bien» and counts the answer in its deck', () => {
    round(true);
    press(' ');
    expect(onAnswer).toHaveBeenCalledWith('20');
    expect(onChange).toHaveBeenLastCalledWith({ answered: 'good' });
  });

  it('with the answer shown, 1 is «Otra vez» and 2 is «Bien»; 3 and 4 do nothing', () => {
    round(true);
    press('1');
    press('2');
    expect(press('3').defaultPrevented).toBe(false);
    press('4');
    expect(onChange.mock.calls).toEqual([[{ answered: 'again' }], [{ answered: 'good' }]]);
    expect(onAnswer).toHaveBeenCalledTimes(2);
  });

  it('before the answer shows, 1 and 2 do nothing', () => {
    round(false);
    press('1');
    press('2');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a key held down does nothing; only space and Enter keep the page from scrolling', () => {
    round(true);
    expect(press(' ', { repeat: true }).defaultPrevented).toBe(true);
    expect(press('1', { repeat: true }).defaultPrevented).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each([{ ctrlKey: true }, { metaKey: true }, { altKey: true }])(
    'a key with a modifier (%o) is the browser’s',
    (init) => {
      round(true);
      expect(press(' ', init).defaultPrevented).toBe(false);
      expect(onChange).not.toHaveBeenCalled();
    },
  );

  it('keys typed in a field are left alone, and space on a button presses the button', () => {
    round(false);
    document.body.innerHTML = '<input><button>x</button>';
    press(' ', {}, document.querySelector('input')!);
    expect(press(' ', {}, document.querySelector('button')!).defaultPrevented).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });
});
