// Tests the lines of what is left today: nothing to do says so, the breakdown opens on a tap (closing on a touch
// outside it), on a resting mouse (closing when it leaves) or from the keyboard, and the counts mark the shown queue.
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HOVER_OPEN_MS } from '../../hooks/useHoverOpen';
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

  it('short, a phone reads the load and its minutes, «6 · ~N min», and a wider screen the whole line', () => {
    render(<DayLoad counts={SOME} medianAnswerMs={10_000} short />);
    expect(screen.getByText(/^6 · ~\d+ min$/)).toHaveClass('sm:hidden');
    expect(screen.getByText(/^6 para hoy · ~\d+ min$/)).toHaveClass('max-sm:hidden');
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
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('a mouse resting on the text opens it after a short wait, and leaving the text closes it', () => {
    vi.useFakeTimers();
    try {
      render(<DayLoad counts={SOME} medianAnswerMs={10_000} detail />);
      const button = screen.getByRole('button', { name: /6 para hoy/ });
      fireEvent.pointerEnter(button, { pointerType: 'mouse' });
      act(() => {
        vi.advanceTimersByTime(HOVER_OPEN_MS - 1);
      });
      expect(button).toHaveAttribute('aria-expanded', 'false');
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(button).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('status')).toHaveClass('pointer-events-none');
      fireEvent.pointerLeave(button, { pointerType: 'mouse' });
      expect(button).toHaveAttribute('aria-expanded', 'false');
      fireEvent.pointerEnter(button, { pointerType: 'mouse' });
      fireEvent.pointerLeave(button, { pointerType: 'mouse' });
      act(() => {
        vi.advanceTimersByTime(HOVER_OPEN_MS);
      });
      expect(button).toHaveAttribute('aria-expanded', 'false');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a touch passing over it opens nothing; a mouse click only opens it', () => {
    render(<DayLoad counts={SOME} medianAnswerMs={10_000} detail />);
    const button = screen.getByRole('button', { name: /6 para hoy/ });
    fireEvent.pointerEnter(button, { pointerType: 'touch' });
    fireEvent.pointerLeave(button, { pointerType: 'touch' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    for (let i = 0; i < 2; i++) {
      fireEvent.pointerDown(button, { pointerType: 'mouse' });
      fireEvent.click(button);
      expect(button).toHaveAttribute('aria-expanded', 'true');
    }
  });

  it('a screen reader hears the breakdown with the closed button', () => {
    render(<DayLoad counts={SOME} medianAnswerMs={10_000} detail />);
    const button = screen.getByRole('button', { name: /6 para hoy/ });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAccessibleDescription('Nuevas: 3 · Aprendiendo: 1 · A repasar: 2');
  });

  it('beside the text from `sm` up: to its left, or to its right when asked', () => {
    const { rerender } = render(<DayLoad counts={SOME} medianAnswerMs={10_000} detail />);
    const box = () => screen.getByRole('status', { hidden: true });
    expect(box()).toHaveClass('sm:right-full');
    expect(box()).not.toHaveClass('sm:left-full');
    rerender(<DayLoad counts={SOME} medianAnswerMs={10_000} detail side="right" />);
    expect(box()).toHaveClass('sm:left-full');
    expect(box()).not.toHaveClass('sm:right-full');
  });

  it('from the keyboard: Enter opens it, Escape and leaving with Tab close it', async () => {
    render(
      <>
        <DayLoad counts={SOME} medianAnswerMs={10_000} detail />
        <button type="button">siguiente</button>
      </>,
    );
    const button = screen.getByRole('button', { name: /6 para hoy/ });
    await userEvent.tab();
    expect(button).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('a');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    await userEvent.tab();
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
