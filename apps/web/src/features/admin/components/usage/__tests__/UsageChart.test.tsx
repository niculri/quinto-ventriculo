// Tests the chart of «Uso»: a figure by day or by week, the opens only by day, its axis of round marks, and the box with
// the data of a column under the mouse, the keyboard or a tap, or the strip above the bars on a phone.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FEW } from '@qv/schema';
import type { UsageFigures, UsageReport } from '@qv/schema';
import { describe, expect, it } from 'vitest';
import { UsageChart } from '../UsageChart';

const figures = (n: number): UsageFigures => ({
  activeStudents: n,
  newStudents: n,
  ankiAnswers: n * 70,
  newCards: n,
  roundsStarted: n,
  roundsFinished: n,
});

const report = (opens: UsageReport['opens']): UsageReport =>
  ({
    days: [
      { day: '2026-11-23', ...figures(10) },
      { day: '2026-11-24', ...figures(5) },
      { day: '2026-11-25', ...figures(0) },
    ],
    weeks: [{ week: '2026-11-16', ...figures(15) }],
    opens,
  }) as UsageReport;

const OPENS = {
  days: [{ day: '2026-11-24', notes: 7, decks: FEW, quizzes: 0, searches: 1 }],
} as UsageReport['opens'];

const list = () => screen.getByRole('list');
const bars = () => within(list()).queryAllByRole('listitem');
const columns = () => within(list()).queryAllByRole('button');
/** The marks of the axis, as they read. */
const axis = () =>
  [...document.querySelectorAll('[aria-hidden="true"].relative.h-40 > span.absolute')].map(
    (e) => e.textContent,
  );
const tip = () => document.querySelector('.pointer-events-none.absolute');
const strip = () => document.querySelector('[data-chart-tip="strip"]');

async function choose(label: string, option: string) {
  await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${label}`) }));
  await userEvent.click(await screen.findByRole('menuitemradio', { name: option }));
}

describe('UsageChart', () => {
  it('a figure goes by day, or by week when chosen, with an axis of round marks', async () => {
    render(<UsageChart report={report(null)} />);
    expect(screen.getByRole('list', { name: 'Alumnos activos, por día' })).toBeInTheDocument();
    expect(bars()).toHaveLength(3);
    expect(axis()).toEqual(['0', '5', '10']);
    expect(columns()[0]).toHaveAccessibleName(
      'lunes 23 de noviembre: 10 alumnos activos; 10 alumnos nuevos',
    );
    await choose('Cifra', 'Respuestas de Anki');
    expect(axis()).toEqual(['0', '500', '1.000']);
    expect(columns()[0]).toHaveAccessibleName(
      'lunes 23 de noviembre: 700 respuestas de Anki; 10 tarjetas nuevas vistas',
    );
    await choose('Periodo', 'Últimas 12 semanas');
    expect(
      screen.getByRole('list', { name: 'Respuestas de Anki, por semana' }),
    ).toBeInTheDocument();
    expect(bars()).toHaveLength(1);
    expect(columns()[0]).toHaveAccessibleName(/^Semana del lunes 16 de noviembre: 1.050 /);
  });

  it('an open goes by day even with the week chosen, alone, and «menos de 5» is not a number', async () => {
    render(<UsageChart report={report(OPENS)} />);
    await choose('Periodo', 'Últimas 12 semanas');
    await choose('Cifra', 'Mazos abiertos');
    expect(screen.getByRole('list', { name: 'Mazos abiertos, por día' })).toBeInTheDocument();
    expect(columns()).toHaveLength(1);
    expect(columns()[0]).toHaveAccessibleName('martes 24 de noviembre: —');
    await userEvent.hover(columns()[0]!);
    expect(tip()?.querySelectorAll('p')).toHaveLength(2);
    expect(axis()).toEqual(['0', '1', '2']);
  });

  it('an open chosen that stops coming leaves the chart empty and unnamed, with its axis', async () => {
    const { rerender } = render(<UsageChart report={report(OPENS)} />);
    await choose('Cifra', 'Apuntes abiertos');
    expect(columns()[0]).toHaveAccessibleName('martes 24 de noviembre: 7 apuntes abiertos');
    rerender(<UsageChart report={report(null)} />);
    expect(bars()).toHaveLength(0);
    expect(screen.getByRole('list', { name: ', por día' })).toBeInTheDocument();
    expect(axis()).toEqual(['0', '1', '2']);
  });

  it('the mouse over a day shows its box, also on a day in 0, and leaving hides it', async () => {
    render(<UsageChart report={report(null)} />);
    expect(tip()).toBeNull();
    await userEvent.hover(columns()[2]!);
    expect(tip()).toHaveTextContent('miércoles 25 de noviembre0 alumnos activos0 alumnos nuevos');
    expect(tip()?.getAttribute('style')).toContain('right: min(33.3333% + 0.375rem, 100% - 12rem)');
    await userEvent.unhover(list());
    expect(tip()).toBeNull();
    fireEvent.pointerEnter(columns()[0]!, { pointerType: 'touch' });
    expect(tip()).toBeNull();
  });

  it('one Tab stop, the last day; the arrows, Home and End go through the days, and Escape or leaving hides it', async () => {
    render(
      <>
        <UsageChart report={report(null)} />
        <button type="button">después</button>
      </>,
    );
    expect(columns().map((c) => c.tabIndex)).toEqual([-1, -1, 0]);
    act(() => {
      columns()[2]!.focus();
    });
    expect(tip()).toHaveTextContent(/^miércoles 25/);
    await userEvent.keyboard('{ArrowLeft}');
    expect(columns()[1]).toHaveFocus();
    expect(tip()).toHaveTextContent(/^martes 24/);
    expect(tip()?.getAttribute('style')).toContain('left: min(66.6667% + 0.375rem, 100% - 12rem)');
    await userEvent.keyboard('{Home}');
    expect(columns()[0]).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}{End}{ArrowRight}');
    expect(columns()[2]).toHaveFocus();
    await userEvent.keyboard('a');
    expect(tip()).toHaveTextContent(/^miércoles 25/);
    await userEvent.keyboard('{Escape}');
    expect(tip()).toBeNull();
    await userEvent.keyboard('{ArrowLeft}');
    expect(tip()).toHaveTextContent(/^martes 24/);
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'después' })).toHaveFocus();
    expect(tip()).toBeNull();
    expect(columns().map((c) => c.tabIndex)).toEqual([-1, 0, -1]);
  });

  it('a tap shows the box until a tap elsewhere; a tap on the chart keeps it', () => {
    render(<UsageChart report={report(null)} />);
    fireEvent.click(columns()[0]!);
    expect(tip()).toHaveTextContent(/^lunes 23/);
    fireEvent.pointerDown(columns()[1]!);
    expect(tip()).toHaveTextContent(/^lunes 23/);
    fireEvent.pointerDown(document.body);
    expect(tip()).toBeNull();
  });

  it('on a phone the data goes in a strip kept above the bars, empty until a tap, and the box hides', () => {
    render(<UsageChart report={report(null)} />);
    expect(strip()).toHaveAttribute('aria-hidden', 'true');
    expect(strip()).toHaveClass('h-13', 'sm:hidden');
    expect(strip()).toBeEmptyDOMElement();
    fireEvent.click(columns()[1]!);
    expect(strip()).toHaveTextContent('martes 24 de noviembre5 alumnos activos5 alumnos nuevos');
    expect(tip()).toHaveTextContent('martes 24 de noviembre5 alumnos activos5 alumnos nuevos');
    expect(tip()).toHaveClass('hidden', 'sm:block');
    expect([...strip()!.querySelectorAll('p')].every((p) => p.classList.contains('truncate'))).toBe(
      true,
    );
    expect(tip()?.querySelector('p.truncate')).toBeNull();
    fireEvent.pointerDown(document.body);
    expect(strip()).toBeEmptyDOMElement();
    expect(strip()?.nextElementSibling).toHaveClass('relative', 'h-40');
  });

  it('without days the keys do nothing', async () => {
    render(<UsageChart report={null} />);
    act(() => {
      list().focus();
    });
    fireEvent.keyDown(list(), { key: 'End' });
    expect(tip()).toBeNull();
    expect(
      await screen.findByRole('list', { name: 'Alumnos activos, por día' }),
    ).toBeEmptyDOMElement();
  });
});
