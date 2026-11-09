import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fullAnkiStudy, renderApp } from '../../test/render';
import type { StudyRepository } from '../study/repository';
import { studyKeys } from '../study/queries';
import { dayNumber } from './heatmap';
import type { HeatmapData } from './heatmap';
import { heatmapKeys } from './queries';

const D = dayNumber;
// A Tuesday of November, at noon in Santiago: its study day is 10-11-2026.
const NOW = new Date('2026-11-10T12:00:00-03:00');
const TODAY = D('2026-11-10');

const DATA: HeatmapData = {
  days: [
    { day: D('2025-12-30'), deckId: '20', answers: 8, practice: 0 },
    { day: D('2026-11-06'), deckId: '20', answers: 30, practice: 0 },
    { day: D('2026-11-08'), deckId: '20', answers: 20, practice: 5 },
    { day: D('2026-11-08'), deckId: '99', answers: 7, practice: 0 },
    { day: D('2026-11-09'), deckId: '21', answers: 12, practice: 0 },
  ],
  due: [
    { day: TODAY, cards: 18 },
    { day: D('2026-11-13'), cards: 239 },
  ],
};

function withHeatmap(heatmap: StudyRepository['heatmap']) {
  const study = fullAnkiStudy();
  const calls: (string[] | null)[] = [];
  study.heatmap = (ids) => {
    calls.push(ids);
    return heatmap(ids);
  };
  return { study, calls };
}

const grid = () => screen.findByRole('grid', { name: /^Días de estudio de/ });
const cell = (name: RegExp) => screen.getByRole('gridcell', { name });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('the heatmap on the home page', () => {
  it('shows the year, today and the four figures', async () => {
    const { study, calls } = withHeatmap(async () => DATA);
    renderApp('/home', { study });
    await grid();
    const box = screen.getByRole('region', { name: 'Días de estudio' });
    await waitFor(() => expect(within(box).getByText('Racha actual')).toBeInTheDocument());
    await waitFor(() => expect(cell(/^10 de noviembre de 2026 \(hoy\)/)).toBeInTheDocument());
    // Every deck of the student: null.
    expect(calls[0]).toBeNull();
    // Today without answers: what is due. The days before, what was studied.
    expect(cell(/\(hoy\)/)).toHaveAccessibleName('10 de noviembre de 2026 (hoy): 18 por repasar');
    expect(cell(/^8 de noviembre de 2026/)).toHaveAccessibleName(
      '8 de noviembre de 2026: 32 respuestas',
    );
    expect(cell(/^7 de noviembre de 2026/)).toHaveAccessibleName(
      '7 de noviembre de 2026: sin estudio',
    );
    expect(cell(/^13 de noviembre de 2026/)).toHaveAccessibleName(
      '13 de noviembre de 2026: 239 por repasar',
    );
    // 4 days with something (8, 30, 32, 12): 82 ÷ 4 = 20.5, which the add-on (Python's round) makes 20; 4 of the 316
    // days since 30-12-2025; the 8 and the 9 in a row.
    const figure = (label: string) => within(box).getByText(label).nextElementSibling;
    expect(figure('Promedio diario')).toHaveTextContent('20 respuestas');
    expect(figure('Días estudiados')).toHaveTextContent('1 %');
    expect(figure('Racha más larga')).toHaveTextContent('2 días');
    expect(figure('Racha actual')).toHaveTextContent('2 días');
    // 54 weeks of 7 days, and the weekdays' column.
    const rows = within(await grid()).getAllByRole('row');
    expect(rows).toHaveLength(7);
    for (const r of rows) expect(r.querySelectorAll('td')).toHaveLength(54);
  });

  it('a day opens a box with its total and its courses; no link that goes nowhere', async () => {
    const { study } = withHeatmap(async () => DATA);
    renderApp('/home', { study });
    await grid();
    await waitFor(() => expect(cell(/^8 de noviembre de 2026: 32/)).toBeInTheDocument());
    await userEvent.click(cell(/^8 de noviembre de 2026/));
    const box = await screen.findByRole('dialog', { name: /Domingo 8 de noviembre de 2026/i });
    expect(box).toHaveTextContent('32 respuestas');
    const parts = within(box)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    // Deck 99 is no longer on the site.
    expect(parts).toEqual(['🦴 Anatomía I25', 'Otros mazos7']);
    expect(within(box).queryByRole('link')).toBeNull();
    // It floats over the page: outside the section.
    expect(screen.getByRole('region', { name: 'Días de estudio' }).contains(box)).toBe(false);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    // A day ahead: what is due.
    await userEvent.click(cell(/^13 de noviembre de 2026/));
    expect(await screen.findByRole('dialog')).toHaveTextContent('239 por repasar');
  });

  it('one stop in the tab order, and the arrows go through the days; Enter opens the day', async () => {
    const { study } = withHeatmap(async () => DATA);
    renderApp('/home', { study });
    const table = await grid();
    await waitFor(() => expect(cell(/\(hoy\)/)).toHaveAttribute('tabindex', '0'));
    expect(table.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
    cell(/\(hoy\)/).focus();
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(document.activeElement).toHaveAccessibleName(/^3 de noviembre de 2026/);
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    expect(document.activeElement).toHaveAccessibleName(/^8 de noviembre de 2026/);
    expect(table.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
    expect(await screen.findByRole('dialog')).toHaveTextContent('32 respuestas');
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(document.activeElement).toHaveAccessibleName(/^1 de enero de 2026/);
  });

  it('◀ ● ▶ go from the first year with something to the last with something due', async () => {
    const { study } = withHeatmap(async () => DATA);
    renderApp('/home', { study });
    await grid();
    const back = screen.getByRole('button', { name: 'Año anterior' });
    const ahead = screen.getByRole('button', { name: 'Año siguiente' });
    const home = screen.getByRole('button', { name: 'Volver a hoy' });
    await waitFor(() => expect(back).toBeEnabled());
    expect(ahead).toBeDisabled();
    expect(home).toBeDisabled();
    await userEvent.click(back);
    expect(
      await screen.findByRole('grid', { name: 'Días de estudio de 2025' }),
    ).toBeInTheDocument();
    expect(cell(/^30 de diciembre de 2025/)).toHaveAccessibleName(
      '30 de diciembre de 2025: 8 respuestas',
    );
    expect(back).toBeDisabled();
    await userEvent.click(home);
    expect(
      await screen.findByRole('grid', { name: 'Días de estudio de 2026' }),
    ).toBeInTheDocument();
  });

  it('with nothing yet: the empty grid and one line where the figures go', async () => {
    const { study } = withHeatmap(async () => ({ days: [], due: [] }));
    renderApp('/home', { study });
    expect(await screen.findByText('Tus días de estudio van a aparecer aquí.')).toBeInTheDocument();
    expect(cell(/\(hoy\)/)).toHaveAccessibleName('10 de noviembre de 2026 (hoy): nada por repasar');
  });

  it('an error stays inside the box, with «Reintentar»', async () => {
    let fail = true;
    const { study } = withHeatmap(async () => {
      if (fail) throw new Error('sin red');
      return DATA;
    });
    renderApp('/home', { study });
    const retry = await screen.findByRole('button', { name: 'Reintentar' });
    expect(screen.getByText('No se pudieron cargar tus días de estudio.')).toBeInTheDocument();
    fail = false;
    await userEvent.click(retry);
    await waitFor(() => expect(cell(/^8 de noviembre de 2026: 32/)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull();
  });
});

describe('the heatmap on a course’s page', () => {
  it('only that course’s decks, by assessment', async () => {
    const { study, calls } = withHeatmap(async (ids) => ({
      days: DATA.days.filter((d) => ids?.includes(d.deckId)),
      due: [],
    }));
    renderApp('/semesters/1/courses/anatomia-1', { study });
    await screen.findByRole('grid', { name: /^Días de estudio de/ });
    expect(screen.getByRole('region', { name: 'Días de estudio' })).toBeInTheDocument();
    expect(calls[0]).toEqual(['3', '4', '5', '20', '21']);
    await waitFor(() => expect(cell(/^8 de noviembre de 2026: 25/)).toBeInTheDocument());
    await userEvent.click(cell(/^8 de noviembre de 2026/));
    const box = await screen.findByRole('dialog');
    expect(
      within(box)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Certamen 125']);
  });
});

describe('the heatmap’s data', () => {
  it('are kept with the study’s: ending a study session reads them again', async () => {
    const client = new QueryClient();
    let n = 0;
    await client.prefetchQuery({
      queryKey: heatmapKeys.scope('all'),
      queryFn: async () => ++n,
      staleTime: 5 * 60_000,
    });
    expect(client.getQueryState(heatmapKeys.scope('all'))?.isInvalidated).toBe(false);
    await client.invalidateQueries({ queryKey: studyKeys.all });
    expect(client.getQueryState(heatmapKeys.scope('all'))?.isInvalidated).toBe(true);
  });
});
