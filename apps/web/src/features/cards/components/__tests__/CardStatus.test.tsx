// Tests what the cards of a note are in words and dots: the counts by state, the marked ones, and the dots beyond 8.

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { explorerCard, matched } from '../../../../test/cardsUiFakes';
import { Dots, statusText } from '../CardStatus';

describe('statusText', () => {
  it.each([
    [[explorerCard(0)], '1 tarjeta: 1 sin ver'],
    [
      [
        explorerCard(0, { status: 'hidden' }),
        explorerCard(1, { status: 'seen' }),
        explorerCard(2, { status: 'seen', marked: true }),
        explorerCard(3, { status: 'hard' }),
        explorerCard(4, { status: 'hard' }),
        explorerCard(5, { status: 'new' }),
        explorerCard(6, { status: 'new' }),
      ],
      '7 tarjetas: 2 sin ver, 2 vistas, 2 me cuestan, 1 oculta, 1 marcada',
    ],
    [
      [
        explorerCard(0, { status: 'seen', marked: true }),
        explorerCard(1, { status: 'hard', marked: true }),
        explorerCard(2, { status: 'hidden' }),
        explorerCard(3, { status: 'hidden' }),
      ],
      '4 tarjetas: 1 vista, 1 me cuesta, 2 ocultas, 2 marcadas',
    ],
  ])('counts each state in a fixed order, singular or plural (%#)', (cards, text) => {
    expect(statusText(cards)).toBe(text);
  });
});

describe('Dots', () => {
  it('draws at most 8 dots and counts the rest, with a flag when a card is marked', () => {
    const cards = Array.from({ length: 10 }, (_, i) =>
      explorerCard(i, {
        status: (['new', 'seen', 'hard', 'hidden'] as const)[i % 4]!,
        marked: i === 9,
      }),
    );
    const { container } = render(<Dots m={matched({ cards })} />);
    const dots = container.firstElementChild!;
    expect(dots.querySelector('.lucide-flag')).not.toBeNull();
    expect(dots.querySelectorAll(':scope > span:not(.text-muted)')).toHaveLength(8);
    expect(dots.lastElementChild).toHaveTextContent('+2');
  });

  it('without a marked card there is no flag, and 8 cards need no count', () => {
    const cards = Array.from({ length: 8 }, (_, i) => explorerCard(i));
    const { container } = render(<Dots m={matched({ cards })} />);
    expect(container.querySelector('.lucide-flag')).toBeNull();
    expect(container.textContent).toBe('');
  });
});
