// Tests the parts of a row of the deck list: today's load in words and what is left to see, with a week's topics on.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RowSeen, RowToday } from '../DeckRowParts';

const today = (over: Partial<Parameters<typeof RowToday>[0]> = {}) =>
  render(
    <RowToday
      counts={{ new: 0, learning: 0, review: 0 }}
      medianAnswerMs={null}
      off={false}
      lookOnly={false}
      withNew
      {...over}
    />,
  ).container;

describe('today in a row', () => {
  it('new and reviews apart (learning ones are reviews), leaving out what is 0, and the minutes', () => {
    expect(today({ counts: { new: 12, learning: 3, review: 12 } }).textContent).toBe(
      'Hoy: 12 nuevas · 15 repasos · ~10 min',
    );
    expect(today({ counts: { new: 0, learning: 0, review: 1 } }).textContent).toBe(
      'Hoy: 1 repaso · ~1 min',
    );
    expect(today({ counts: { new: 1, learning: 0, review: 0 } }).textContent).toBe(
      'Hoy: 1 nueva · ~1 min',
    );
  });

  it('below the assessment, only its reviews: the new ones a day are shared by the whole assessment', () => {
    const below = (counts: { new: number; learning: number; review: number }) =>
      today({ counts, withNew: false }).textContent;
    expect(below({ new: 12, learning: 3, review: 20 })).toBe('Hoy: 23 repasos · ~6 min');
    expect(below({ new: 12, learning: 0, review: 0 })).toBe('Hoy: solo nuevas');
    expect(below({ new: 0, learning: 0, review: 0 })).toBe('Listo por hoy');
  });

  it('with nothing: «Listo por hoy», or «Sin activar» when off; only the draft, «Solo para mirar»', () => {
    expect(today().textContent).toBe('Listo por hoy');
    expect(today({ off: true }).textContent).toBe('Sin activar');
    expect(today({ lookOnly: true }).textContent).toBe('Solo para mirar');
    expect(today({ counts: undefined }).querySelector('.animate-pulse')).not.toBeNull();
  });
});

describe('the cards seen of a row', () => {
  const seen = (props: Parameters<typeof RowSeen>[0]) => render(<RowSeen {...props} />).container;

  it('says what is left to see, of how many, or that all were seen, with a bar of what was seen', () => {
    const text = (seenCards: number, total: number) =>
      seen({ seen: { seen: seenCards, total }, topics: null, topicsId: 't' }).textContent;
    expect(text(0, 377)).toBe('377 sin ver');
    expect(text(64, 377)).toBe('313 sin ver de 377');
    expect(text(377, 377)).toBe('Todas vistas (377)');
    expect(text(1, 1)).toBe('Vista (1)');
    expect(text(0, 0)).toBe('Sin tarjetas');
    const after = seen({ seen: { seen: 1200, total: 4800 }, topics: null, topicsId: 'w' });
    expect(after.textContent).toContain('3.600 sin ver de 4.800');
    expect(after.querySelector('[style]')).toHaveStyle({ width: '25%' });
    expect(
      seen({ seen: undefined, topics: null, topicsId: 'x' }).querySelector('.animate-pulse'),
    ).not.toBeNull();
  });

  it('a week says how many of its topics are on: beside, only while some are; on a phone, always', () => {
    const part = seen({
      seen: { seen: 0, total: 9 },
      topics: { on: 1, total: 3 },
      topicsId: 'part',
    });
    expect(document.getElementById('part')).toHaveTextContent('1 de 3 temas activados');
    expect(part.querySelector('.sm\\:inline')).toHaveTextContent('· 1 de 3 temas activados');
    expect(part.querySelector('.sm\\:hidden')).toHaveTextContent('1 de 3 temas activados');
    const all = seen({ seen: { seen: 0, total: 9 }, topics: { on: 1, total: 1 }, topicsId: 'all' });
    expect(document.getElementById('all')).toHaveTextContent('1 de 1 tema activado');
    expect(all.querySelector('.sm\\:inline')).toBeNull();
    expect(screen.getAllByText(/9 sin ver/).length).toBeGreaterThan(0);
  });
});
