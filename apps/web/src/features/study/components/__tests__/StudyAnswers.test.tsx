// Tests of the answer buttons: a second tap right after «Mostrar respuesta» is not an answer; the keyboard and a
// tap elsewhere or later are.
import { useState } from 'react';
import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { Shown } from '@qv/study';
import type { StudyActions } from '../../hooks/useStudySession';
import { StudyAnswers } from '../StudyAnswers';

const shown = { labels: ['1 min', '6 min', '10 min', '4 d'] } as unknown as Shown;

function Harness({ answer }: { answer: StudyActions['answer'] }) {
  const [revealed, setRevealed] = useState(false);
  const act = { reveal: () => setRevealed(true), answer } as unknown as StudyActions;
  return (
    <StudyAnswers
      act={act}
      shown={shown}
      revealed={revealed}
      fourButtons={false}
      full={false}
      failed={false}
    />
  );
}

function click(element: HTMLElement, at: number, detail: number, x = 100) {
  const event = createEvent.click(element, { detail, clientX: x, clientY: 500 });
  Object.defineProperty(event, 'timeStamp', { value: at });
  fireEvent(element, event);
}

it('ignores the second tap of a double tap on «Mostrar respuesta», not the keyboard, a tap elsewhere nor a later tap', () => {
  const answer = vi.fn();
  render(<Harness answer={answer} />);
  click(screen.getByRole('button', { name: 'Mostrar respuesta' }), 1000, 1);
  const good = screen.getByRole('button', { name: /Bien/ });
  click(good, 1200, 1);
  expect(answer).not.toHaveBeenCalled();
  click(good, 1250, 0);
  expect(answer).toHaveBeenCalledExactlyOnceWith(3);
  click(good, 1260, 1, 300);
  expect(answer).toHaveBeenCalledTimes(2);
  click(good, 1300, 1);
  expect(answer).toHaveBeenCalledTimes(3);
});
