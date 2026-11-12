import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { dayOf, dayStartsAt } from '@qv/srs';
import { DECK_PATH, fullAnkiStudy, renderApp } from '../../test/render';
import { cardShadowRoot } from '../decks/CardFrame';
import { failedOf } from '../cards/queries';
import type { DayCards } from '../cards/queries';
import { countsByDay, heatmapStats, isoOfDay } from '../stats/heatmap';
import type { HeatmapData } from '../stats/heatmap';
import { correctPercent, daySummary } from './day-summary';
import { browserTimeZone, defaultPreferences, localStudyRepository } from './repository';
import type { StudyRepository } from './repository';

/**
 * Step 3.4 (ANK-15): the summary of «Listo por hoy». Its figures are those of review_log for the site's day, and its
 * streak is the one of «Días de estudio».
 */

const WEEK_ID = '5';
const ASSESSMENT_PATH = '/semesters/1/courses/anatomia-1/anki/certamen-1';
/** The test deck and its Extras: what studying DECK_PATH covers. */
const SCOPE = new Set(['20', '21']);

const answer = (deckId: string, noteGuid: string, ord: number, rating: 1 | 2 | 3 | 4) => ({
  deckId,
  noteGuid,
  ord,
  rating,
  reviewedAt: '2026-11-12T15:00:00.000Z',
});

describe('the summary, without React', () => {
  it('counts the scope’s answers, «% bien» without «Otra vez», and each failed card once', () => {
    const answers = [
      answer('20', 'a', 0, 1),
      answer('20', 'a', 0, 3),
      answer('20', 'a', 0, 1),
      answer('21', 'b', 1, 2),
      answer('20', 'c', 0, 4),
      // Another deck: not of what was studied.
      answer('99', 'z', 0, 1),
    ];
    const heat: HeatmapData = {
      days: [
        { day: 100, deckId: '20', answers: 5, practice: 0 },
        { day: 99, deckId: '99', answers: 0, practice: 3 },
        { day: 98, deckId: '99', answers: 2, practice: 0 },
        { day: 96, deckId: '20', answers: 9, practice: 0 },
      ],
      due: [],
    };
    const s = daySummary(answers, SCOPE, heat, 100);
    expect(s).toEqual({ answers: 5, correct: 3, failedCards: 1, streak: 3, courseStreak: null });
    // The course's own streak, under the whole one: only its decks count (day 96 is not after 100 without a gap).
    expect(daySummary(answers, SCOPE, heat, 100, new Set(['20', '21'])).courseStreak).toBe(1);
    expect(daySummary(answers, SCOPE, heat, 100, new Set(['20', '99'])).courseStreak).toBe(3);
    expect(correctPercent(s)).toBe(60);
    // The same streak as «Días de estudio» (every course, practice too).
    expect(s.streak).toBe(heatmapStats(countsByDay(heat.days, 100), 100).currentStreak);
    expect(correctPercent({ answers: 0, correct: 0 })).toBeNull();
    expect(correctPercent({ answers: 3, correct: 2 })).toBe(67);
    // Never «100 %» with one failed, nor «0 %» with one right (Revisión de cero, 3.4).
    expect(correctPercent({ answers: 200, correct: 199 })).toBe(99);
    expect(correctPercent({ answers: 200, correct: 1 })).toBe(1);
    expect(correctPercent({ answers: 200, correct: 200 })).toBe(100);
    expect(correctPercent({ answers: 4, correct: 0 })).toBe(0);
  });

  it('«Falladas» of a day already answered are that day’s, not those of the last days', () => {
    const day: DayCards = {
      day: 100,
      kind: 'answered',
      keys: new Set(['a', 'b']),
      answers: 3,
      failed: new Set(['a']),
      practice: 0,
    };
    const recent = new Set(['a', 'b', 'c']);
    expect(failedOf(day, recent)).toEqual(new Set(['a']));
    expect(failedOf({ ...day, kind: 'due', failed: new Set() }, recent)).toBe(recent);
    expect(failedOf(null, recent)).toBe(recent);
    expect(failedOf(null, undefined)).toBeUndefined();
  });
});

async function student(): Promise<StudyRepository> {
  const study = localStudyRepository(null, { welcomeSeen: true });
  await study.setDeckActivation(WEEK_ID, true);
  return study;
}

/** The first card «Otra vez», every other answer «Bien», up to «Listo por hoy». */
async function studyToTheEnd() {
  let first = true;
  for (let i = 0; i < 30; i++) {
    if (screen.queryByRole('heading', { name: 'Listo por hoy' })) return;
    const show = await screen.findByRole('button', { name: 'Mostrar respuesta' });
    await waitFor(() =>
      expect(
        cardShadowRoot(screen.getByRole('region', { name: /Frente/ }))?.querySelector('.card'),
      ).toBeTruthy(),
    );
    await userEvent.click(show);
    await userEvent.click(
      await screen.findByRole('button', { name: first ? /^Otra vez/ : /^Bien/ }),
    );
    first = false;
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Listo por hoy' }) ??
          screen.getByRole('button', { name: 'Mostrar respuesta' }),
      ).toBeTruthy(),
    );
  }
  throw new Error('It never ended');
}

const prefsOf = async (study: StudyRepository) => ({
  ...defaultPreferences(),
  ...(await study.preferences()),
});

/** The whole text, not a part of it («4» is not «14»). */
const exactly = (text: string | number) =>
  new RegExp(`^${String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);

describe('«Listo por hoy»', () => {
  it('says today’s answers, «% bien» and the streak, the same as review_log and «Días de estudio»', async () => {
    const base = await student();
    const prefs = await prefsOf(base);
    const today = dayOf(Date.now() / 1000, prefs.timeZone, prefs.dayStartsAt);
    // Two days before today, made up: the streak is 3 with today.
    const study: StudyRepository = {
      ...base,
      async heatmap(deckIds) {
        const real = await base.heatmap(deckIds);
        return {
          ...real,
          days: [
            ...real.days,
            { day: today - 1, deckId: '20', answers: 4, practice: 0 },
            { day: today - 2, deckId: '999', answers: 0, practice: 6 },
            { day: today - 4, deckId: '20', answers: 8, practice: 0 },
          ],
        };
      },
    };
    const page = renderApp(`${DECK_PATH}/study`, { study });
    await studyToTheEnd();
    const box = await screen.findByRole('region', { name: 'Resumen de hoy' });

    const from = new Date(dayStartsAt(today, prefs.timeZone, prefs.dayStartsAt) * 1000);
    const to = new Date(dayStartsAt(today + 1, prefs.timeZone, prefs.dayStartsAt) * 1000);
    const log = (await study.ratedBetween(from, to)).filter((a) => SCOPE.has(a.deckId));
    const correct = log.filter((a) => a.rating !== 1).length;
    expect(log.length).toBeGreaterThan(3);
    const figure = (label: string) => within(box).getByText(label).nextElementSibling!;
    await waitFor(() => expect(figure('Respuestas hoy')).toHaveTextContent(exactly(log.length)));
    expect(figure('Bien')).toHaveTextContent(
      exactly(`${Math.round((correct / log.length) * 100)} %`),
    );
    expect(figure('Racha actual')).toHaveTextContent(exactly('3 días'));
    // Under it, the course's: the day of deck 999 (another course) does not count.
    expect(figure('Racha actual').nextElementSibling).toHaveTextContent(exactly('2 en el ramo'));

    // «Ver las que fallaste»: the cards page of the assessment, only this deck, today, «Falladas».
    const link = within(box).getByRole('link', { name: 'Ver las que fallaste' });
    const url = new URL(link.getAttribute('href')!, 'http://x');
    expect(url.pathname).toBe(`${ASSESSMENT_PATH}/cards`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      unit: 's1-semana-de-prueba/mazo-de-prueba',
      day: isoOfDay(today),
      state: 'failed',
    });
    page.unmount();

    // The home page says the same streak.
    renderApp('/home', { study });
    const home = await screen.findByRole('region', { name: 'Días de estudio' });
    await waitFor(() =>
      expect(within(home).getByText('Racha actual').nextElementSibling).toHaveTextContent('3 días'),
    );
  });

  it('«Ver las que fallaste» lists the card failed today', async () => {
    const study = await student();
    const page = renderApp(`${DECK_PATH}/study`, { study });
    await studyToTheEnd();
    const box = await screen.findByRole('region', { name: 'Resumen de hoy' });
    const link = await within(box).findByRole('link', { name: 'Ver las que fallaste' });
    const href = link.getAttribute('href')!;
    page.unmount();
    renderApp(href, { study });
    expect(await screen.findByText('1 nota · 1 tarjeta')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    const panel = await screen.findByRole('dialog', { name: 'Filtros' });
    expect(within(panel).getByRole('radio', { name: /^Falladas ese día/ })).toBeChecked();
  });

  it('without an answer today in what is studied, there is no summary', async () => {
    const study = await student();
    await study.saveAssessmentSetting({ deckId: '4', includeExtras: false, newPerDay: 0 });
    renderApp(`${DECK_PATH}/study`, { study });
    expect(await screen.findByRole('heading', { name: 'Listo por hoy' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Resumen de hoy' })).toBeNull();
  });

  it('with no card failed, no «Ver las que fallaste»', async () => {
    const study = await student();
    renderApp(`${DECK_PATH}/study`, { study });
    for (let i = 0; i < 30 && !screen.queryByRole('heading', { name: 'Listo por hoy' }); i++) {
      await userEvent.click(await screen.findByRole('button', { name: 'Mostrar respuesta' }));
      await userEvent.click(await screen.findByRole('button', { name: /^Bien/ }));
      await waitFor(() =>
        expect(
          screen.queryByRole('heading', { name: 'Listo por hoy' }) ??
            screen.getByRole('button', { name: 'Mostrar respuesta' }),
        ).toBeTruthy(),
      );
    }
    const box = await screen.findByRole('region', { name: 'Resumen de hoy' });
    await waitFor(() =>
      expect(within(box).getByText('Bien').nextElementSibling).toHaveTextContent(exactly('100 %')),
    );
    expect(within(box).queryByRole('link')).toBeNull();
  });

  it('reads the site’s day in review_log: from the rollover hour in the browser’s zone, other sessions too (Revisión de cero, 3.4)', async () => {
    // The site always uses the browser's zone (usePreferences); the rollover hour is the student's.
    const base = localStudyRepository(null, {
      welcomeSeen: true,
      timeZone: browserTimeZone(),
      dayStartsAt: 7,
    });
    await base.setDeckActivation(WEEK_ID, true);
    const prefs = await prefsOf(base);
    const today = dayOf(Date.now() / 1000, prefs.timeZone, prefs.dayStartsAt);
    const start = dayStartsAt(today, prefs.timeZone, prefs.dayStartsAt) * 1000;
    const end = dayStartsAt(today + 1, prefs.timeZone, prefs.dayStartsAt) * 1000;
    // Made up, in review_log and not in this session: a minute after the day started (another session of today, an
    // «Otra vez») and a minute before it (yesterday's, which does not count).
    const elsewhere = [
      { ...answer('20', 'otra-sesion', 0, 1), reviewedAt: new Date(start + 60_000).toISOString() },
      { ...answer('21', 'ayer', 0, 3), reviewedAt: new Date(start - 60_000).toISOString() },
    ];
    const study: StudyRepository = {
      ...base,
      async ratedBetween(from, to) {
        const mine = elsewhere.filter(
          (a) =>
            Date.parse(a.reviewedAt) >= from.getTime() && Date.parse(a.reviewedAt) < to.getTime(),
        );
        return [...mine, ...(await base.ratedBetween(from, to))];
      },
    };
    renderApp(`${DECK_PATH}/study`, { study });
    await studyToTheEnd();
    const box = await screen.findByRole('region', { name: 'Resumen de hoy' });
    const session = (await base.ratedBetween(new Date(start), new Date(end))).filter((a) =>
      SCOPE.has(a.deckId),
    );
    const total = session.length + 1;
    const correct = session.filter((a) => a.rating !== 1).length;
    const figure = (label: string) => within(box).getByText(label).nextElementSibling!;
    await waitFor(() => expect(figure('Respuestas hoy')).toHaveTextContent(exactly(total)));
    expect(figure('Bien')).toHaveTextContent(exactly(`${Math.round((correct / total) * 100)} %`));
    const link = within(box).getByRole('link', { name: 'Ver las que fallaste' });
    expect(new URL(link.getAttribute('href')!, 'http://x').searchParams.get('day')).toBe(
      isoOfDay(today),
    );
  });

  it('in «Modo avanzado», «¡Felicitaciones!» has it too', async () => {
    renderApp(`${DECK_PATH}/study`, { study: fullAnkiStudy() });
    for (let i = 0; i < 3; i++) {
      await screen.findByRole('button', { name: 'Mostrar respuesta' });
      await userEvent.keyboard(' ');
      await screen.findByRole('button', { name: /^Fácil/ });
      await userEvent.keyboard('4');
    }
    await screen.findByRole('heading', {
      name: '¡Felicitaciones! Has finalizado este mazo por ahora.',
    });
    const box = await screen.findByRole('region', { name: 'Resumen de hoy' });
    const figure = (label: string) => within(box).getByText(label).nextElementSibling!;
    await waitFor(() => expect(figure('Respuestas hoy')).toHaveTextContent(exactly(3)));
    expect(figure('Bien')).toHaveTextContent(exactly('100 %'));
    expect(within(box).queryByRole('link')).toBeNull();
  });

  it('opening a session with answers already today reads nothing for the summary (Revisión de cero, 3.4)', async () => {
    const base = await student();
    let reads = 0;
    const study: StudyRepository = {
      ...base,
      async ratedBetween(from, to) {
        reads++;
        return base.ratedBetween(from, to);
      },
    };
    // A first visit answers one card and leaves.
    const first = renderApp(`${DECK_PATH}/study`, { study });
    await userEvent.click(await screen.findByRole('button', { name: 'Mostrar respuesta' }));
    await userEvent.click(await screen.findByRole('button', { name: /^Bien/ }));
    await screen.findByRole('button', { name: 'Mostrar respuesta' });
    await waitFor(async () => expect(await base.ratedSince(new Date(0))).toHaveLength(1));
    first.unmount();
    // The second one starts with a card: no summary was drawn, not even for a frame, so nothing was read.
    renderApp(`${DECK_PATH}/study`, { study });
    await screen.findByRole('button', { name: 'Mostrar respuesta' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(reads).toBe(0);
    expect(screen.queryByRole('region', { name: 'Resumen de hoy' })).toBeNull();
  });
});
