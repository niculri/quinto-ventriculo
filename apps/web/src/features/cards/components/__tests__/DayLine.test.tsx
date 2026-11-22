// Tests the line of a heatmap day: what it says for a day due, answered, practiced or both, a day that does not
// exist, one it could not read, and while it reads.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateText } from '@qv/study';
import { describe, expect, it, vi } from 'vitest';
import type { DayCards } from '../../model/dayCards';
import { DayLine } from '../DayLine';

const DAY = 20_400;
const value = (patch: Partial<DayCards>): DayCards => ({
  day: DAY,
  kind: 'answered',
  keys: new Set(['a', 'b']),
  answers: 3,
  failed: new Set(),
  practice: 0,
  ...patch,
});

function line(
  v: DayCards | null,
  { day = DAY, failed = false }: { day?: number | null; failed?: boolean } = {},
) {
  const onRetry = vi.fn();
  const onClear = vi.fn();
  render(<DayLine day={day} value={v} onClear={onClear} failed={failed} onRetry={onRetry} />);
  return { status: screen.getByRole('status'), onRetry, onClear };
}

const date = dateText(DAY, true);

describe('DayLine', () => {
  it.each([
    ['due', value({ kind: 'due', answers: 0 }), `${date}: 2 tarjetas por repasar.`],
    ['answered', value({}), `${date}: respondiste 2 tarjetas (3 respuestas).`],
    [
      'only practiced',
      value({ keys: new Set(), answers: 0, practice: 1 }),
      `${date}: 1 respuesta de práctica, que no se guardan por tarjeta.`,
    ],
    [
      'answered and practiced',
      value({ practice: 4 }),
      `${date}: respondiste 2 tarjetas (3 respuestas) y 4 respuestas de práctica, que no se guardan por tarjeta.`,
    ],
  ])('a day %s says so', (_, v, text) => {
    expect(line(v).status).toHaveTextContent(text);
  });

  it('a day that does not exist says so, and the cross goes back to every day', async () => {
    const { status, onClear } = line(null, { day: null });
    expect(status).toHaveTextContent('Ese día no existe.');
    await userEvent.click(screen.getByRole('button', { name: 'Ver todos los días' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('a day it could not read offers to read it again', async () => {
    const { status, onRetry } = line(null, { failed: true });
    expect(status).toHaveTextContent('No se pudieron leer las tarjetas de ese día.');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('while it reads it keeps the place of the text, with nothing to retry', () => {
    const { status } = line(null);
    expect(status.textContent).toBe('');
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull();
  });
});
