// Tests a photo's cell in the list's grid: its answer, hidden or missing, and its picture's least height.

import { QueriesWrapper } from '../../../../test/QueriesWrapper';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { matched } from '../../../../test/cardsUiFakes';
import { PhotoCell } from '../PhotoCell';

const PHOTO = { kind: 'photo' as const, thumb: 'cards/thumb/z.webp', back: 'Respuesta inventada' };

function cell(note: object, hideAnswers: boolean, imageHeight = 120) {
  const onOpen = vi.fn();
  const m = matched({ note: { ...PHOTO, ...note } });
  render(
    <PhotoCell
      m={m}
      position={5}
      hideAnswers={hideAnswers}
      thumbs="q=1"
      onOpen={onOpen}
      imageHeight={imageHeight}
    />,
    { wrapper: QueriesWrapper },
  );
  return { button: screen.getByRole('button'), onOpen, m };
}

describe('PhotoCell', () => {
  it('names the photo with its answer, and opens its note', async () => {
    const { button, onOpen, m } = cell({}, false);
    expect(button).toHaveTextContent('Foto: Respuesta inventada — 1 tarjeta: 1 sin ver');
    expect(button).toHaveAttribute('data-position', '5');
    await userEvent.click(button);
    expect(onOpen).toHaveBeenCalledWith(m);
  });

  it('with the answers hidden, or without an answer, the answer is an empty place', () => {
    expect(cell({}, true).button).toHaveTextContent(/^Foto — 1 tarjeta/);
  });

  it('a photo without an answer has the empty place even with the answers in view', () => {
    expect(cell({ back: '' }, false).button).toHaveTextContent(/^Foto — 1 tarjeta/);
  });

  it('the picture is never shorter than 40px, nor blurred', () => {
    const { button } = cell({}, false, 10);
    expect((button.firstElementChild as HTMLElement).style.height).toBe('40px');
    expect(button.querySelector('img')).not.toHaveClass('blur-[6px]');
  });
});
