// The end of a round: corrected at the end the stations stay in their order, and a station without an answer counts
// as wrong without a button to turn it around.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { CaRound } from '@qv/gymkana';
import { GYM_DECK, GYM_INDEX } from '../../../../test/fixtures/gymkana';
import { gymkanaStations } from '../../model/stations';
import { CaResults } from '../CaResults';

const { stations } = gymkanaStations(GYM_INDEX, new Set([GYM_DECK]), GYM_DECK);
const at = '2026-11-24T12:00:00.000Z';
const ROUND: CaRound = {
  version: 1,
  id: 'r',
  origin: 'cover',
  startedAt: at,
  stations: stations.map((s) => s.key),
  results: [
    { text: 'recto lateral', score: 1, correct: true, timedOut: false, manual: false, at },
    null,
    { text: 'parótida', score: 0, correct: false, timedOut: true, manual: false, at },
  ],
  index: 3,
  seconds: 0,
  correction: 'end',
  finished: true,
};

describe('CaResults', () => {
  it('lists the stations in their order and repeats the wrong ones', async () => {
    const user = userEvent.setup();
    const onRepeatWrong = vi.fn();
    const onToggle = vi.fn();
    render(
      <MemoryRouter>
        <CaResults
          round={ROUND}
          byKey={
            new Map(
              stations.map((s, i) => [s.key, i ? { ...s, code: null } : { ...s, version: null }]),
            )
          }
          cover="/gymkana"
          onRepeatWrong={onRepeatWrong}
          onToggle={onToggle}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: '1 de 3 buenas' })).toBeInTheDocument();
    expect(screen.getByText('33 %')).toBeInTheDocument();
    const rows = within(screen.getByRole('list', { name: 'Estaciones de la ronda' })).getAllByRole(
      'listitem',
    );
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Músculo recto lateral'),
      expect.stringContaining('Sin respuesta'),
      expect.stringContaining('parótida'),
    ]);
    expect(within(rows[1]!).queryByRole('button')).toBeNull();
    expect(rows[0]).toHaveTextContent('Estación 1 · T-PR-G2-1.1');
    expect(rows[2]).not.toHaveTextContent('T-PR-G2');
    await user.click(within(rows[2]!).getByRole('button', { name: 'Contarla como buena' }));
    expect(onToggle).toHaveBeenCalledWith(2);
    await user.click(screen.getByRole('button', { name: 'Repetir las 2 malas' }));
    expect(onRepeatWrong).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Otra ronda' })).toHaveAttribute('href', '/gymkana');
  });

  it('with every station right, has nothing to repeat', () => {
    const results = ROUND.results.map(() => ROUND.results[0]!);
    render(
      <MemoryRouter>
        <CaResults
          round={{ ...ROUND, results, stations: ROUND.stations.slice(0, 1) }}
          byKey={new Map(stations.map((s) => [s.key, s]))}
          cover="/gymkana"
          onRepeatWrong={vi.fn()}
          onToggle={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: /Repetir/ })).toBeNull();
  });
});
