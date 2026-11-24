// Tests a deck's statistics page: the cards by state, the table by period, the chart, the hardest cards with their
// fronts and links, the advanced mode, an error, and the ways in from a deck's page and a course's page.
import { screen, waitFor, within } from '@testing-library/react';
import { activityChartStrings } from '../components/strings/ActivityChart.strings';
import { cardStatesStrings } from '../components/strings/CardStates.strings';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CardStatsData } from '@qv/study';
import { dayNumber } from '@qv/study';
import { renderApp } from '../../../test/render';
import { fullAnkiStudy } from '../../../test/fakes/repositories';
import { localStudyRepository } from '../../progress/api/repository';
import { fakeApi } from '../../../test/fakes/api';
import { CATALOG } from '../../../test/fixtures/catalog';
import type { StudyRepository } from '../../progress/api/repository';

const NOW = new Date(2026, 10, 10, 12);
const TODAY = dayNumber('2026-11-10');
const COURSE = '/semesters/1/courses/anatomia-1';
const PAGE = `${COURSE}/anki/certamen-1/stats`;

const day = (offset: number, extra: Partial<CardStatsData['days'][number]> = {}) => ({
  day: TODAY + offset,
  answers: 10,
  newCards: 2,
  learning: 1,
  ms: 90 * 60_000,
  youngPassed: 3,
  youngFailed: 1,
  maturePassed: 4,
  matureFailed: 0,
  ...extra,
});

const DATA: CardStatsData = {
  today: TODAY,
  cards: { learning: 1, relearning: 1, young: 3, mature: 2, suspended: 1, buried: 1 },
  days: [
    day(-40, { ms: 30 * 60_000 }),
    day(-20),
    day(-3, { ms: 20_000 }),
    day(0, {
      answers: 0,
      newCards: 0,
      learning: 0,
      ms: 0,
      youngPassed: 0,
      youngFailed: 0,
      maturePassed: 0,
      matureFailed: 0,
    }),
  ],
  due: [
    { day: TODAY, cards: 4 },
    { day: TODAY + 2, cards: 6 },
  ],
  overdue: 2,
  hardest: [
    { noteGuid: 'cloze-1', ord: 1, deckId: '21', lapses: 5, reps: 9 },
    { noteGuid: 'oclusion-1', ord: 0, deckId: '20', lapses: 1, reps: 1 },
    { noteGuid: 'gone', ord: 0, deckId: '99', lapses: 1, reps: 3 },
  ],
  total: { answers: 1234, ms: 3 * 3_600_000, days: 3 },
};

function study(data: CardStatsData | Error, base: StudyRepository = localStudyRepository(null)) {
  const calls: (string[] | null)[] = [];
  base.cardStats = async (ids) => {
    calls.push(ids);
    if (data instanceof Error) throw data;
    return data;
  };
  return { study: base, calls };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('a deck’s statistics', () => {
  it('shows the cards by state, the periods, the chart and the hardest cards of everything below it', async () => {
    const { study: s, calls } = study(DATA);
    renderApp(PAGE, { study: s });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Tus estadísticas' }),
    ).toBeInTheDocument();
    await screen.findByText('Viste 7 de 4');
    expect(calls[0]).toEqual(['4', '5', '20', '21']);
    expect(screen.getByText('En total: 1.234 respuestas (3 h) en 3 días.')).toBeInTheDocument();

    const table = screen.getByRole('table', { name: /Tus respuestas, tu tiempo/ });
    const rows = within(table)
      .getAllByRole('row')
      .map((r) => r.textContent);
    expect(rows[1]).toBe('Hoy00 min—0 repasos');
    expect(rows[2]).toBe('7 días10< 1 min88 %8 repasos');
    expect(rows[3]).toBe('30 días201 h 30 min88 %16 repasos');
    expect(rows[4]).toBe('1 año302 h88 %24 repasos');
    expect(within(table).queryByText('Jóvenes')).toBeNull();

    expect(
      screen.getByRole('img', {
        name: 'Últimos 30 días: 20 respuestas. Próximos 30 días: 6 por repasar.',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Hoy te toca repasar 4 tarjetas, más 2 atrasadas.'),
    ).toBeInTheDocument();
    expect(screen.getByText('máx. 10')).toBeInTheDocument();

    const hard = screen.getByRole('region', { name: 'Las que más te cuestan' });
    await waitFor(() =>
      expect(within(hard).getByText('La columna tiene […] vértebras […]')).toBeInTheDocument(),
    );
    const links = within(hard).getAllByRole('link');
    expect(links[0]).toHaveAccessibleName('Abrir «T-PR-01-002» en el explorador');
    expect(links[0]).toHaveAttribute('href', `${COURSE}/anki/certamen-1/cards?card=1%3Acloze-1`);
    expect(links[0]).toHaveTextContent('T-PR-01-002 · Extras');
    expect(links[0]).toHaveTextContent('5 olvidos9 repasos');
    expect(links[1]).toHaveTextContent('Vértebra de prueba');
    expect(links[1]).toHaveTextContent('1 olvido1 repaso');
    expect(links[2]).toHaveAccessibleName('Abrir «Tarjeta sin texto» en el explorador');
    expect(links[3]).toHaveAttribute('href', `${COURSE}/anki/certamen-1/cards?state=hard`);
    expect(screen.getByText(/En «Modo avanzado» ves además/)).toBeInTheDocument();
  });

  it('in the advanced mode, young and mature apart and how learning and hidden split', async () => {
    const { study: s } = study(
      { ...DATA, total: { answers: 1, ms: 60_000, days: 1 } },
      fullAnkiStudy(),
    );
    const catalog = structuredClone(CATALOG);
    delete catalog.semesters[0]!.courses[0]!.assessments[0]!.cardIndex;
    renderApp(PAGE, { study: s, api: fakeApi({ catalog: async () => catalog }) });
    const table = await screen.findByRole('table', { name: /Tus respuestas, tu tiempo/ });
    await waitFor(() =>
      expect(within(table).getAllByRole('row')[2]).toHaveTextContent(
        '7 días10< 1 min88 %8 repasos75 %100 %',
      ),
    );
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Hoy00 min—0 repasos——');
    expect(screen.getByText('En total: 1 respuesta (1 min) en 1 día.')).toBeInTheDocument();
    expect(screen.getByText(/Ocultas: las suspendidas y las enterradas\./)).toBeInTheDocument();
    expect(
      screen.getAllByRole('link', { name: 'Abrir «Tarjeta sin texto» en el explorador' }),
    ).toHaveLength(3);
    expect(screen.getByText('1 por primera vez')).toBeInTheDocument();
    expect(screen.getByText('1 reaprendiendo')).toBeInTheDocument();
    expect(screen.getByText('1 suspendida')).toBeInTheDocument();
    expect(screen.getByText('1 enterrada')).toBeInTheDocument();
    expect(screen.queryByText(/En «Modo avanzado» ves además/)).toBeNull();
  });

  it('with nothing studied: no percent, no hard cards, and less than a minute', async () => {
    const { study: s } = study({
      ...DATA,
      cards: { learning: 0, relearning: 0, young: 0, mature: 0, suspended: 0, buried: 0 },
      days: [
        day(0, {
          answers: 1,
          ms: 5000,
          youngPassed: 1,
          youngFailed: 0,
          maturePassed: 0,
          matureFailed: 0,
        }),
      ],
      due: [],
      overdue: 0,
      hardest: [],
      total: { answers: 0, ms: 0, days: 0 },
    });
    renderApp(PAGE, { study: s });
    await screen.findByText('Todavía no has olvidado ninguna de estas tarjetas.');
    expect(screen.getByText('Viste 0 de 4')).toBeInTheDocument();
    expect(
      screen.getByText('Todavía no has respondido ninguna de estas tarjetas.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Ocultas: las de «No mostrar más» y las que quedaron para mañana\./),
    ).toBeInTheDocument();
    const table = screen.getByRole('table', { name: /Tus respuestas, tu tiempo/ });
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Hoy1< 1 min100 %1 repaso');
    expect(screen.getByText('Hoy no te toca repasar ninguna tarjeta.')).toBeInTheDocument();
  });

  it('says in words what is due today and how the hidden ones split', () => {
    expect(cardStatesStrings.hiddenSplit(2, 0)).toEqual(['2 suspendidas', '0 enterradas']);
    expect(activityChartStrings.dueToday(1, 1)).toBe(
      'Hoy te toca repasar 1 tarjeta, más 1 atrasada.',
    );
    expect(activityChartStrings.dueToday(2, 0)).toBe('Hoy te toca repasar 2 tarjetas.');
    expect(activityChartStrings.dueToday(0, 3)).toBe('Hoy tienes 3 atrasadas por repasar.');
    expect(activityChartStrings.dueToday(0, 1)).toBe('Hoy tienes 1 atrasada por repasar.');
  });

  it('while loading, every section is in its place, also in the advanced mode', async () => {
    const base = fullAnkiStudy();
    base.cardStats = () => new Promise(() => undefined);
    renderApp(PAGE, { study: base });
    const table = await screen.findByRole('table', { name: /Tus respuestas, tu tiempo/ });
    await waitFor(() => expect(within(table).getByText('Maduras')).toBeInTheDocument());
    expect(screen.queryByRole('img', { name: /Últimos 30 días/ })).toBeNull();
    expect(screen.getByRole('region', { name: 'Las que más te cuestan' })).toBeInTheDocument();
    expect(screen.queryByText(/En total:/)).toBeNull();
  });

  it('says why it could not read them, and tries again', async () => {
    const { study: s } = study(new Error('No se pudo leer tus estadísticas: sin red'));
    renderApp(PAGE, { study: s });
    let tries = 0;
    s.cardStats = async () => {
      tries++;
      throw new Error('sin red');
    };
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    const before = tries;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(tries).toBe(before + 1));
  });

  it('the course’s page and every deck’s page lead to it', async () => {
    const { router } = renderApp(COURSE, { study: study(DATA).study });
    await userEvent.click(await screen.findByRole('link', { name: 'Tus estadísticas' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`${COURSE}/anki/stats`));
    expect(
      await screen.findByText('Tus tarjetas de Anatomía I. Estas cifras solo las ves tú.'),
    ).toBeInTheDocument();
    await router.navigate(`${COURSE}/anki/certamen-1`);
    await userEvent.click(await screen.findByRole('link', { name: 'Estadísticas' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(PAGE));
  });
});
