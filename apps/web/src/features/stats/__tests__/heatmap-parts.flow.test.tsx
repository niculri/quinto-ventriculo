// Characterizes the parts of the study heatmap: the month and weekday labels, the day box on hover and pinned, its
// lines and links, closing it, and the figures while they come.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fullAnkiStudy, renderApp } from '../../../test/render';
import type { StudyRepository } from '../../progress/api/repository';
import { dayNumber } from '@qv/study';
import type { HeatmapData } from '@qv/study';

const D = dayNumber;
// A Tuesday of November, at noon in Santiago: its study day is 10-11-2026 from 11 hours behind UTC to 12 ahead.
const NOW = new Date('2026-11-10T12:00:00-03:00');
const TODAY = D('2026-11-10');

const DATA: HeatmapData = {
  days: [
    { day: D('2026-11-06'), deckId: '20', answers: 30, practice: 0 },
    { day: D('2026-11-08'), deckId: '20', answers: 20, practice: 5 },
    { day: D('2026-11-08'), deckId: '99', answers: 7, practice: 0 },
    { day: TODAY, deckId: '21', answers: 4, practice: 0 },
  ],
  due: [{ day: D('2026-11-13'), cards: 239 }],
};

function withHeatmap(heatmap: StudyRepository['heatmap']) {
  const study = fullAnkiStudy();
  study.heatmap = heatmap;
  return study;
}

const grid = () => screen.findByRole('grid', { name: /^Días de estudio de/ });
const cell = (name: RegExp) => screen.getByRole('gridcell', { name });
const ready = () => waitFor(() => expect(cell(/^8 de noviembre de 2026: 32/)).toBeInTheDocument());

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('the grid', () => {
  it('has the months on top, the weekdays on the side and the year’s group', async () => {
    renderApp('/home', { study: withHeatmap(async () => DATA) });
    const table = await grid();
    const months = table.parentElement!.firstElementChild!;
    expect(months.getAttribute('aria-hidden')).toBe('true');
    expect([...months.children].map((m) => m.textContent)).toMatchInlineSnapshot(`
      [
        "ene",
        "feb",
        "mar",
        "abr",
        "may",
        "jun",
        "jul",
        "ago",
        "sept",
        "oct",
        "nov",
        "dic",
      ]
    `);
    expect(
      within(table)
        .getAllByRole('rowheader')
        .map((th) => th.textContent),
    ).toEqual(['Lu', '', 'Mi', '', 'Vi', '', '']);
    const year = screen.getByRole('group', { name: 'Año' });
    expect(year.textContent).toBe('2026');
    expect(table).toHaveAttribute('aria-busy', 'true');
    await ready();
    expect(table).toHaveAttribute('aria-busy', 'false');
    expect(cell(/\(hoy\)/)).toHaveAttribute('aria-current', 'date');
  });

  it('on a course’s page, the same title', async () => {
    renderApp('/semesters/1/courses/anatomia-1', { study: withHeatmap(async () => DATA) });
    await grid();
    expect(screen.getByRole('heading', { name: 'Días de estudio' })).toBeInTheDocument();
  });
});

describe('the day box', () => {
  it('on hover, a tooltip without links nor «Cerrar», that goes when the mouse leaves the grid', async () => {
    renderApp('/home', { study: withHeatmap(async () => DATA) });
    const table = await grid();
    await ready();
    fireEvent.mouseEnter(cell(/^8 de noviembre de 2026/));
    const tip = await screen.findByRole('tooltip', { name: /8 de noviembre/i });
    expect(tip.textContent).toMatchInlineSnapshot(
      `"domingo 8 de noviembre de 202632 respuestas🦴 Anatomía I25Otros mazos7"`,
    );
    expect(within(tip).queryByRole('link')).toBeNull();
    expect(within(tip).queryByRole('button')).toBeNull();
    expect(tip.className).toContain('pointer-events-none');
    fireEvent.mouseLeave(table);
    await waitFor(() =>
      expect(screen.queryByRole('tooltip', { name: /8 de noviembre/i })).toBeNull(),
    );
  });

  it('pinned today: «· hoy», its course, «Ver esas tarjetas» and «Cerrar» back to the day', async () => {
    renderApp('/home', { study: withHeatmap(async () => DATA) });
    await grid();
    await ready();
    await userEvent.click(cell(/\(hoy\)/));
    const box = await screen.findByRole('dialog');
    expect(box.textContent).toMatchInlineSnapshot(
      `"martes 10 de noviembre de 2026 · hoy4 respuestas🦴 Anatomía I4 Ver esas tarjetas"`,
    );
    expect(
      within(box)
        .getAllByRole('link')
        .map((a) => [a.textContent, a.getAttribute('href')]),
    ).toMatchInlineSnapshot(`
      [
        [
          "🦴 Anatomía I4",
          "/semesters/1/courses/anatomia-1/anki/cards?day=2026-11-10",
        ],
        [
          " Ver esas tarjetas",
          "/semesters/1/courses/anatomia-1/anki/cards?day=2026-11-10",
        ],
      ]
    `);
    await userEvent.click(within(box).getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(cell(/\(hoy\)/));
  });

  it('a past day without study and a future one with nothing due', async () => {
    renderApp('/home', { study: withHeatmap(async () => DATA) });
    await grid();
    await ready();
    await userEvent.click(cell(/^7 de noviembre de 2026/));
    expect((await screen.findByRole('dialog')).textContent).toMatchInlineSnapshot(
      `"sábado 7 de noviembre de 2026Sin estudio"`,
    );
    await userEvent.click(cell(/^7 de noviembre de 2026/));
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(cell(/^20 de noviembre de 2026/));
    expect((await screen.findByRole('dialog')).textContent).toMatchInlineSnapshot(
      `"viernes 20 de noviembre de 2026Nada por repasar"`,
    );
  });

  it('on a course’s page, «Ver esas tarjetas» takes to the whole course', async () => {
    renderApp('/semesters/1/courses/anatomia-1', {
      study: withHeatmap(async (ids) => ({
        days: DATA.days.filter((d) => ids?.includes(d.deckId)),
        due: [],
      })),
    });
    await grid();
    await waitFor(() => expect(cell(/^6 de noviembre de 2026: 30/)).toBeInTheDocument());
    await userEvent.click(cell(/^6 de noviembre de 2026/));
    const box = await screen.findByRole('dialog');
    expect(
      within(box)
        .getAllByRole('link')
        .map((a) => [a.textContent, a.getAttribute('href')]),
    ).toMatchInlineSnapshot(`
      [
        [
          "Certamen 130",
          "/semesters/1/courses/anatomia-1/anki/certamen-1/cards?day=2026-11-06",
        ],
        [
          " Ver esas tarjetas",
          "/semesters/1/courses/anatomia-1/anki/cards?day=2026-11-06",
        ],
      ]
    `);
  });

  it('a scroll or a click outside closes it', async () => {
    renderApp('/home', { study: withHeatmap(async () => DATA) });
    await grid();
    await ready();
    await userEvent.click(cell(/^8 de noviembre de 2026/));
    await screen.findByRole('dialog');
    fireEvent.scroll(window);
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(cell(/^8 de noviembre de 2026/));
    await screen.findByRole('dialog');
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opened with the keyboard, it takes the focus', async () => {
    renderApp('/home', { study: withHeatmap(async () => DATA) });
    await grid();
    await ready();
    cell(/\(hoy\)/).focus();
    fireEvent.keyDown(document.activeElement!, { key: ' ' });
    const box = await screen.findByRole('dialog');
    await waitFor(() => expect(document.activeElement).toBe(box));
    fireEvent.keyDown(cell(/\(hoy\)/), { key: 'Enter' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('the figures', () => {
  it('while they come, the four labels with a skeleton each', async () => {
    renderApp('/home', { study: withHeatmap(() => new Promise(() => {})) });
    await grid();
    const box = screen.getByRole('region', { name: 'Días de estudio' });
    const list = box.querySelector('dl')!;
    expect([...list.querySelectorAll('dt')].map((dt) => dt.textContent)).toEqual([
      'Promedio diario',
      'Días estudiados',
      'Racha más larga',
      'Racha actual',
    ]);
    expect([...list.querySelectorAll('dd')].map((dd) => dd.textContent)).toEqual(['', '', '', '']);
    expect(list.querySelectorAll('dd > *')).toHaveLength(4);
  });

  it('a streak of one day says «1 día»', async () => {
    renderApp('/home', {
      study: withHeatmap(async () => ({
        days: [{ day: TODAY, deckId: '20', answers: 3, practice: 0 }],
        due: [],
      })),
    });
    await grid();
    const box = screen.getByRole('region', { name: 'Días de estudio' });
    await waitFor(() => expect(within(box).getByText('Racha actual')).toBeInTheDocument());
    await waitFor(() =>
      expect(within(box).getByText('Racha actual').nextElementSibling).toHaveTextContent('1 día'),
    );
    expect(box.querySelector('dl')!.textContent).toMatchInlineSnapshot(
      `"Promedio diario3 respuestasDías estudiados100 %Racha más larga1 díaRacha actual1 día"`,
    );
  });
});
