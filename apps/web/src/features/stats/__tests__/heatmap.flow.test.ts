// Tests the study heatmap on the home and course pages: figures, day box, keyboard, years, empty and error states.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fullAnkiStudy } from '../../../test/fakes/repositories';
import { renderApp } from '../../../test/render';
import type { StudyRepository } from '../../progress/api/repository';
import { studyKeys } from '../../progress/queries';
import { dayNumber } from '@qv/study';
import type { HeatmapData } from '@qv/study';
import { heatmapKeys } from '../api/queries';
import { fakeApi } from '../../../test/fakes/api';
import { CATALOG } from '../../../test/fixtures/catalog';

const D = dayNumber;
// A Tuesday of November, at noon wherever the test runs: its study day is 10-11-2026 in any time zone.
const NOW = new Date(2026, 10, 10, 12);
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
  const quizCalls: (string[] | null | undefined)[] = [];
  study.heatmap = (ids, quizIds) => {
    calls.push(ids);
    quizCalls.push(quizIds);
    return heatmap(ids, quizIds);
  };
  return { study, calls, quizCalls };
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
    expect(calls[0]).toBeNull();
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
    const figure = (label: string) => within(box).getByText(label).nextElementSibling;
    expect(figure('Promedio diario')).toHaveTextContent('20 respuestas');
    expect(figure('Días estudiados')).toHaveTextContent('1 %');
    expect(figure('Racha más larga')).toHaveTextContent('2 días');
    expect(figure('Racha actual')).toHaveTextContent('2 días');
    const rows = within(await grid()).getAllByRole('row');
    expect(rows).toHaveLength(7);
    for (const r of rows) expect(r.querySelectorAll('td')).toHaveLength(54);
  });

  it('a day opens a box with its total and its courses; each course takes to its cards of that day', async () => {
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
    expect(parts).toEqual(['🦴 Anatomía I25', 'Otros mazos7']);
    expect(
      within(box)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href')),
    ).toEqual(['/semesters/1/courses/anatomia-1/anki/cards?day=2026-11-08']);
    expect(screen.getByRole('region', { name: 'Días de estudio' }).contains(box)).toBe(false);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
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
    const back = await screen.findByRole('button', { name: 'Año anterior' });
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

  it('with one year of study, only the year: the buttons come with the second one, on its left', async () => {
    const oneYear = { ...DATA, days: DATA.days.slice(1) };
    const { study } = withHeatmap(async () => oneYear);
    renderApp('/home', { study });
    await waitFor(() => expect(cell(/^8 de noviembre de 2026: 32/)).toBeInTheDocument());
    const year = screen.getByRole('group', { name: 'Año' });
    expect(year).toHaveTextContent(/^2026$/);
    expect(within(year).queryAllByRole('button')).toHaveLength(0);
  });

  it('due cards next year are a second year: the buttons come, with the year last', async () => {
    const ahead = { days: DATA.days.slice(1), due: [{ day: D('2027-01-04'), cards: 3 }] };
    const { study } = withHeatmap(async () => ahead);
    renderApp('/home', { study });
    const next = await screen.findByRole('button', { name: 'Año siguiente' });
    await waitFor(() => expect(next).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Año anterior' })).toBeDisabled();
    const year = screen.getByRole('group', { name: 'Año' });
    expect(year.lastElementChild).toHaveTextContent('2026');
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

describe('the questions of tests in the heatmap', () => {
  const WITH_TESTS: HeatmapData = {
    ...DATA,
    tests: [
      { day: D('2026-11-08'), quizId: 'practica-biocel', answers: 6 },
      { day: D('2026-11-10'), quizId: 'practica-biocel', answers: 4 },
      { day: D('2026-11-10'), quizId: 'otro-test', answers: 1 },
    ],
  };

  it('count in the day, in the streak and in its split, and the box says how much was each', async () => {
    const { study, quizCalls } = withHeatmap(async () => WITH_TESTS);
    renderApp('/home', { study });
    await grid();
    const region = screen.getByRole('region', { name: 'Días de estudio' });
    await waitFor(() =>
      expect(cell(/^8 de noviembre de 2026/)).toHaveAccessibleName(
        '8 de noviembre de 2026: 38 respuestas',
      ),
    );
    expect(quizCalls[0]).toBeNull();
    const figure = (label: string) => within(region).getByText(label).nextElementSibling;
    expect(figure('Racha actual')).toHaveTextContent('3 días');
    expect(region).toHaveTextContent('En la racha actual: 55 respuestas, 44 en Anki y 11 en tests');
    await userEvent.click(cell(/^8 de noviembre de 2026/));
    const box = await screen.findByRole('dialog', { name: /Domingo 8 de noviembre de 2026/i });
    expect(box).toHaveTextContent('38 respuestas: 32 en Anki y 6 en tests');
    expect(
      within(box)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['🦴 Anatomía I25', 'Otros mazos7', '🧬 Biología celular6 en tests']);
    await userEvent.keyboard('{Escape}');
    await userEvent.click(cell(/^10 de noviembre de 2026/));
    const today = await screen.findByRole('dialog');
    expect(today).toHaveTextContent('5 respuestas en tests');
    expect(
      within(today)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['🧬 Biología celular4 en tests', 'Otros tests1 en tests']);
    expect(within(today).queryByRole('link')).toBeNull();
  });

  it('a question answered in a test is there on going back, without waiting for the heatmap to age', async () => {
    let tests: NonNullable<HeatmapData['tests']> = [];
    const { study } = withHeatmap(async () => ({ ...DATA, tests }));
    const { router } = renderApp('/home', { study });
    await grid();
    await router.navigate('/semesters/2/courses/biologia-celular/tests/certamen-2/practica/pautas');
    await userEvent.click(await screen.findByRole('button', { name: 'Comenzar' }));
    tests = [{ day: TODAY, quizId: 'practica-biocel', answers: 1 }];
    await userEvent.click(await screen.findByRole('button', { name: /Splicing alternativo/ }));
    await screen.findByText('Correcta', { exact: true });
    await router.navigate('/home');
    await waitFor(() => expect(cell(/\(hoy\): 1 respuesta$/)).toBeInTheDocument());
  });

  it('without a streak, the split is of every day', async () => {
    const { study } = withHeatmap(async () => ({
      days: [{ day: D('2026-11-01'), deckId: '20', answers: 3, practice: 0 }],
      due: [],
      tests: [{ day: D('2026-11-01'), quizId: 'practica-biocel', answers: 1 }],
    }));
    renderApp('/home', { study });
    await grid();
    const region = screen.getByRole('region', { name: 'Días de estudio' });
    await waitFor(() =>
      expect(region).toHaveTextContent('En total: 4 respuestas, 3 en Anki y 1 en tests'),
    );
  });

  it('a course’s page with tests and no decks shows it, and asks for its own tests', async () => {
    const { study, quizCalls } = withHeatmap(async () => ({
      days: [],
      due: [],
      tests: [{ day: D('2026-11-08'), quizId: 'practica-biocel', answers: 1 }],
    }));
    renderApp('/semesters/2/courses/biologia-celular', { study });
    await grid();
    expect(quizCalls[0]).toEqual(['practica-biocel']);
    await waitFor(() => expect(cell(/^8 de noviembre de 2026: 1 respuesta$/)).toBeInTheDocument());
    expect(screen.getByRole('region', { name: 'Días de estudio' })).toHaveTextContent(
      'En total: 1 respuesta en tests',
    );
    await userEvent.click(cell(/^8 de noviembre de 2026/));
    const box = await screen.findByRole('dialog');
    expect(
      within(box)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Certamen 21 en tests']);
  });
});

describe('a group with cards and tests', () => {
  it('says both counts, and still takes to the cards', async () => {
    const anatomy = CATALOG.semesters[0]!.courses[0]!;
    const quiz = {
      ...CATALOG.semesters[1]!.courses[0]!.assessments[0]!.quizzes[0]!,
      id: 'anato-test',
    };
    const catalog = structuredClone(CATALOG);
    catalog.semesters[0]!.courses[0]!.assessments[0]!.quizzes = [
      { ...quiz, courseId: anatomy.id, assessmentId: anatomy.assessments[0]!.id },
    ];
    const { study } = withHeatmap(async () => ({
      days: [{ day: D('2026-11-08'), deckId: '20', answers: 1200, practice: 0 }],
      due: [],
      tests: [{ day: D('2026-11-08'), quizId: 'anato-test', answers: 3 }],
    }));
    renderApp('/home', { study, api: fakeApi({ catalog: async () => catalog }) });
    await grid();
    await waitFor(() => expect(cell(/^8 de noviembre de 2026: 1.203/)).toBeInTheDocument());
    await userEvent.click(cell(/^8 de noviembre de 2026/));
    const box = await screen.findByRole('dialog');
    expect(box).toHaveTextContent('1.203 respuestas: 1.200 en Anki y 3 en tests');
    expect(within(box).getByRole('listitem')).toHaveTextContent('🦴 Anatomía I1.200 + 3 en tests');
    expect(within(box).getAllByRole('link')).toHaveLength(2);
  });
});

describe('the heatmap’s data', () => {
  it('are kept with the study’s: ending a study session reads them again', async () => {
    const client = new QueryClient();
    let n = 0;
    await client.query({
      queryKey: heatmapKeys.scope('all'),
      queryFn: async () => ++n,
      staleTime: 5 * 60_000,
    });
    expect(client.getQueryState(heatmapKeys.scope('all'))?.isInvalidated).toBe(false);
    await client.invalidateQueries({ queryKey: studyKeys.all });
    expect(client.getQueryState(heatmapKeys.scope('all'))?.isInvalidated).toBe(true);
  });
});
