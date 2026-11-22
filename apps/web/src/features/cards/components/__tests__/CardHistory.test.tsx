// Tests a card's history: each answer, newest first, with Anki's kind of answer, its button, interval (days or
// seconds), stability and time; and what it says while loading, failing or with nothing studied.

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UseQueryResult } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { CardLogEntry } from '../../../progress/api/repository';
import { CardHistory } from '../CardHistory';

function entry(patch: Partial<CardLogEntry>): CardLogEntry {
  return {
    action: 'answer',
    reviewedAt: '2026-10-01T12:00:00.000Z',
    rating: 3,
    queueBefore: 'review',
    phaseBefore: 'review',
    phaseAfter: 'review',
    interval: 3,
    stability: 4,
    difficulty: 5,
    durationMs: 6000,
    ...patch,
  };
}

const query = (patch: Partial<UseQueryResult<CardLogEntry[]>>) =>
  ({ isError: false, data: [], error: null, refetch: vi.fn(), ...patch }) as UseQueryResult<CardLogEntry[]>;

describe('CardHistory', () => {
  it('lists the answers newest first, each with its kind, button, interval, stability and time', () => {
    const answers = [
      entry({ phaseBefore: 'new', rating: 1, interval: -600, stability: null, durationMs: null, reviewedAt: '2026-10-01T12:00:00.000Z' }),
      entry({ phaseBefore: 'learning', rating: 2, interval: null, reviewedAt: '2026-10-02T12:00:00.000Z' }),
      entry({ phaseBefore: 'review', rating: 4, interval: 3, reviewedAt: '2026-10-03T12:00:00.000Z' }),
      entry({ phaseBefore: 'relearning', rating: 3, interval: 1, reviewedAt: '2026-10-04T12:00:00.000Z' }),
      entry({ action: 'forget', phaseBefore: 'review', rating: null, interval: null, stability: null, durationMs: null, reviewedAt: '2026-10-05T12:00:00.000Z' }),
    ];
    render(<CardHistory log={query({ data: answers })} answers={answers} />);
    const rows = within(screen.getByRole('table', { name: 'Historial de repasos' })).getAllByRole('row').slice(1);
    const cells = rows.map((r) => within(r).getAllByRole('cell').slice(1).map((c) => c.textContent));
    expect(cells).toEqual([
      ['Manual', '—', '—', '—', '—'],
      ['Reaprendizaje', 'Bien', '1 día', '4 días', '6 segundos'],
      ['Repaso', 'Fácil', '3 días', '4 días', '6 segundos'],
      ['Aprendizaje', 'Difícil', '—', '4 días', '6 segundos'],
      ['Aprendizaje', 'Otra vez', '10 minutos', '—', '—'],
    ]);
    expect(within(rows[4]!).getAllByRole('cell')[2]).toHaveClass('text-[#c62828]');
    expect(within(rows[0]!).getAllByRole('cell')[2]!.className).not.toMatch(/text-\[/);
  });

  it('while it loads says so, and with nothing studied says that', () => {
    const { rerender } = render(<CardHistory log={query({ data: undefined })} answers={[]} />);
    expect(screen.getByText('Cargando el historial…')).toBeInTheDocument();
    rerender(<CardHistory log={query({ data: [] })} answers={[]} />);
    expect(screen.getByText('Todavía no la has estudiado.')).toBeInTheDocument();
  });

  it('a history it could not read offers to read it again', async () => {
    const log = query({ isError: true, data: undefined, error: new Error('sin red') });
    render(<CardHistory log={log} answers={[]} />);
    await userEvent.click(screen.getByRole('button', { name: /Reintentar|Intentar/ }));
    expect(log.refetch).toHaveBeenCalledTimes(1);
  });
});
