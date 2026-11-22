// Tests the chart of «Uso»: a figure by day or by week, the opens only by day, and an open chosen that stops coming
// leaves the chart empty instead of showing another figure.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FEW } from '@qv/schema';
import type { UsageFigures, UsageReport } from '@qv/schema';
import { describe, expect, it } from 'vitest';
import { UsageChart } from '../UsageChart';

const figures = (n: number): UsageFigures => ({
  activeStudents: n,
  newStudents: n,
  ankiAnswers: n,
  newCards: n,
  roundsStarted: n,
  roundsFinished: n,
});

const report = (opens: UsageReport['opens']): UsageReport =>
  ({
    days: [
      { day: '2026-05-01', ...figures(10) },
      { day: '2026-05-02', ...figures(5) },
    ],
    weeks: [{ week: '2026-04-27', ...figures(15) }],
    opens,
  }) as UsageReport;

const OPENS = {
  days: [{ day: '2026-05-02', notes: 7, decks: FEW, quizzes: 0, searches: 1 }],
} as UsageReport['opens'];

const bars = () => within(screen.getByRole('list')).queryAllByRole('listitem');

async function choose(label: string, option: string) {
  await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${label}`) }));
  await userEvent.click(await screen.findByRole('menuitemradio', { name: option }));
}

describe('UsageChart', () => {
  it('a figure goes by day, or by week when chosen, with its maximum', async () => {
    render(<UsageChart report={report(null)} />);
    expect(screen.getByRole('list', { name: 'Alumnos activos, por día' })).toBeInTheDocument();
    expect(bars()).toHaveLength(2);
    expect(screen.getByText('máx. 10')).toBeInTheDocument();
    await choose('Periodo', 'Últimas 12 semanas');
    expect(screen.getByRole('list', { name: 'Alumnos activos, por semana' })).toBeInTheDocument();
    expect(bars()).toHaveLength(1);
    expect(bars()[0]).toHaveTextContent(/^Semana del /);
  });

  it('an open goes by day even with the week chosen, and «menos de 5» is not a number', async () => {
    render(<UsageChart report={report(OPENS)} />);
    await choose('Periodo', 'Últimas 12 semanas');
    await choose('Cifra', 'Mazos abiertos');
    expect(screen.getByRole('list', { name: 'Mazos abiertos, por día' })).toBeInTheDocument();
    expect(bars()).toHaveLength(1);
    expect(bars()[0]).toHaveTextContent('—');
    expect(screen.getByText('máx. 1')).toBeInTheDocument();
  });

  it('an open chosen that stops coming leaves the chart empty and unnamed', async () => {
    const { rerender } = render(<UsageChart report={report(OPENS)} />);
    await choose('Cifra', 'Apuntes abiertos');
    expect(bars()).toHaveLength(1);
    expect(screen.getByText('máx. 7')).toBeInTheDocument();
    rerender(<UsageChart report={report(null)} />);
    expect(bars()).toHaveLength(0);
    expect(screen.getByRole('list', { name: ', por día' })).toBeInTheDocument();
    expect(screen.queryByText('máx. 7')).toBeNull();
  });
});
