// Tests the lines of what is left today: nothing to do says so, the breakdown opens on a tap and closes on a touch
// outside it (not inside), and the three counts mark the queue of the shown card.
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CountNumbers, DayLoad } from '../DeckCounts';

const SOME = { new: 3, learning: 1, review: 2 };
const NONE = { new: 0, learning: 0, review: 0 };

describe('DayLoad', () => {
  it('nothing today shows the empty text, also with the detail asked for, and no button', () => {
    render(<DayLoad counts={NONE} medianAnswerMs={null} detail empty="Al día" />);
    expect(screen.getByText('Al día')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('without the detail, the load with its breakdown only for screen readers', () => {
    render(<DayLoad counts={SOME} medianAnswerMs={10_000} />);
    expect(screen.getByText(/^6 para hoy/)).toHaveAttribute(
      'title',
      'Nuevas: 3 · Aprendiendo: 1 · A repasar: 2',
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('with the detail, a tap opens the breakdown; a touch inside keeps it, one outside closes it', async () => {
    render(
      <>
        <DayLoad counts={SOME} medianAnswerMs={10_000} detail />
        <p>afuera</p>
      </>,
    );
    const button = screen.getByRole('button', { name: /6 para hoy/ });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Nuevas3Aprendiendo1A repasar2');
    fireEvent.pointerDown(screen.getByRole('status'));
    expect(button).toHaveAttribute('aria-expanded', 'true');
    fireEvent.pointerDown(screen.getByText('afuera'));
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(button);
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('CountNumbers', () => {
  it('underlines the queue of the shown card and only it', () => {
    render(<CountNumbers counts={SOME} current="learning" />);
    const underlined = screen
      .getAllByTitle(/Nuevas|Aprendiendo|A repasar/)
      .filter((el) => el.className.includes('underline'));
    expect(underlined.map((el) => el.title)).toEqual(['Aprendiendo']);
  });

  it('is an inline row unless the place gives it its own layout', () => {
    const { container, rerender } = render(<CountNumbers counts={SOME} />);
    expect(container.firstElementChild).toHaveClass('inline-flex');
    rerender(<CountNumbers counts={SOME} className="hidden sm:flex" />);
    expect(container.firstElementChild).not.toHaveClass('inline-flex');
    expect(container.firstElementChild).toHaveClass('hidden', 'sm:flex');
  });
});
