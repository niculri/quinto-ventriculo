// Tests the summary of «Listo por hoy»: its figures are review_log's for the site's day, and its streak is the one
// of «Días de estudio».

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { dayOf, dayStartsAt } from '@qv/srs';
import { fullAnkiStudy } from '../../../../test/fakes/repositories';
import { DECK_PATH } from '../../../../test/fixtures/deck';
import { renderApp } from '../../../../test/render';
import { cardShadowRoot } from '../../../decks/components/CardFrame';
import { failedOf } from '../../../cards/model/dayCards';
import type { DayCards } from '../../../cards/model/dayCards';
import { correctPercent, countsByDay, daySummary, heatmapStats, isoOfDay } from '@qv/study';
import type { HeatmapData } from '@qv/study';
import {
  browserTimeZone,
  defaultPreferences,
  localStudyRepository,
} from '../../../progress/api/repository';
import type { StudyRepository } from '../../../progress/api/repository';
import { StudyRepositoryContext } from '../../../progress/api/context';
import type { CourseDeckNode } from '../../../catalog/model/tree';
import { DaySummary } from '../DaySummary';

const WEEK_ID = '5';
const ASSESSMENT_PATH = '/semesters/1/courses/anatomia-1/anki/certamen-1';
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
    expect(
      daySummary(answers, SCOPE, heat, 100, { decks: new Set(['20', '21']) }).courseStreak,
    ).toBe(1);
    expect(
      daySummary(answers, SCOPE, heat, 100, { decks: new Set(['20', '99']) }).courseStreak,
    ).toBe(3);
    expect(correctPercent(s)).toBe(60);
    expect(s.streak).toBe(heatmapStats(countsByDay(heat.days, 100), 100).currentStreak);
    expect(correctPercent({ answers: 0, correct: 0 })).toBeNull();
    expect(correctPercent({ answers: 3, correct: 2 })).toBe(67);
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

const exactly = (text: string | number) =>
  new RegExp(`^${String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);

describe('«Listo por hoy»', () => {
  it('says today’s answers, «% bien» and the streak, the same as review_log and «Días de estudio»', async () => {
    const base = await student();
    const prefs = await prefsOf(base);
    const today = dayOf(Date.now() / 1000, prefs.timeZone, prefs.dayStartsAt);
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
    expect(figure('Racha actual').nextElementSibling).toHaveTextContent(exactly('2 en el ramo'));

    const link = within(box).getByRole('link', { name: 'Ver las que fallaste' });
    const url = new URL(link.getAttribute('href')!, 'http://x');
    expect(url.pathname).toBe(`${ASSESSMENT_PATH}/cards`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      unit: 's1-semana-de-prueba/mazo-de-prueba',
      day: isoOfDay(today),
      state: 'failed',
    });
    page.unmount();

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

  it('reads the site’s day in review_log: from the rollover hour in the browser’s zone, other sessions too', async () => {
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

  it('opening a session with answers already today reads nothing for the summary', async () => {
    const base = await student();
    let reads = 0;
    const study: StudyRepository = {
      ...base,
      async ratedBetween(from, to) {
        reads++;
        return base.ratedBetween(from, to);
      },
    };
    const first = renderApp(`${DECK_PATH}/study`, { study });
    await userEvent.click(await screen.findByRole('button', { name: 'Mostrar respuesta' }));
    await userEvent.click(await screen.findByRole('button', { name: /^Bien/ }));
    await screen.findByRole('button', { name: 'Mostrar respuesta' });
    await waitFor(async () => expect(await base.ratedSince(new Date(0))).toHaveLength(1));
    first.unmount();
    renderApp(`${DECK_PATH}/study`, { study });
    await screen.findByRole('button', { name: 'Mostrar respuesta' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(reads).toBe(0);
    expect(screen.queryByRole('region', { name: 'Resumen de hoy' })).toBeNull();
  });
});

describe('each «Listo por hoy»', () => {
  it('reads its own summary, even when two are on screen at once', async () => {
    const node = {
      id: 'n1',
      depth: 3,
      parent: null,
      children: [],
      ref: null,
    } as unknown as CourseDeckNode;
    const study = localStudyRepository(null);
    const saved = vi.fn().mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <StudyRepositoryContext value={study}>
          <QueryClientProvider client={new QueryClient()}>
            <DaySummary node={node} prefs={defaultPreferences()} saved={saved} />
            <DaySummary node={node} prefs={defaultPreferences()} saved={saved} />
          </QueryClientProvider>
        </StudyRepositoryContext>
      </MemoryRouter>,
    );
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(2));
  });
});

describe('a summary on its own', () => {
  const show = (study: StudyRepository, node: CourseDeckNode) =>
    render(
      <MemoryRouter>
        <StudyRepositoryContext value={study}>
          <QueryClientProvider
            client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
          >
            <DaySummary node={node} prefs={defaultPreferences()} saved={async () => undefined} />
          </QueryClientProvider>
        </StudyRepositoryContext>
      </MemoryRouter>,
    );
  const lone = {
    id: 'n5',
    depth: 5,
    parent: null,
    children: [],
    ref: { course: { id: 'ramo', semester: 1 }, segments: ['n5'] },
  } as unknown as CourseDeckNode;
  const value = (label: string) =>
    within(screen.getByRole('region', { name: 'Resumen de hoy' })).getByText(label)
      .nextElementSibling!.textContent;

  it('that cannot be read says «—» in each figure and offers «Reintentar», which reads it again', async () => {
    const study = localStudyRepository(null);
    const rated = study.ratedBetween.bind(study);
    let fail = true;
    study.ratedBetween = (from, to) =>
      fail ? Promise.reject(new Error('sin red')) : rated(from, to);
    show(study, lone);
    const retry = await screen.findByRole('button', { name: 'Reintentar' });
    expect(screen.getByText(/^No se pudo leer el resumen\./)).toBeInTheDocument();
    expect(['Respuestas hoy', 'Bien', 'Racha actual'].map(value)).toEqual(['—', '—', '—']);
    fail = false;
    await userEvent.click(retry);
    await waitFor(() => expect(value('Respuestas hoy')).toBe('0'));
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull();
  });

  it('without answers counted, «Bien» has no percent', async () => {
    show(localStudyRepository(null), lone);
    await waitFor(() => expect(value('Respuestas hoy')).toBe('0'));
    expect(value('Bien')).toBe('—');
  });

  it('a deck with nothing above it to list its cards in links its failed cards to itself', async () => {
    const study = localStudyRepository(null);
    const now = Date.now();
    await study.recordReview({
      card: { noteGuid: 'nota', ord: 0, deckId: 'n5' },
      expectedUpdatedAt: null,
      rating: 1,
      queueBefore: 'new',
      interval: 0,
      lastInterval: 0,
      durationMs: 3000,
      state: {
        phase: 'learning',
        interday: false,
        remainingSteps: 2,
        due: new Date(now + 60_000).toISOString(),
        interval: 0,
        stability: 0.4,
        difficulty: 7,
        reps: 1,
        lapses: 0,
        lastReview: new Date(now).toISOString(),
        suspended: false,
        leech: false,
      },
      bury: [],
      buriedUntil: null,
    });
    show(study, lone);
    const link = await screen.findByRole('link', { name: 'Ver las que fallaste' });
    expect(link.getAttribute('href')).toMatch(/^\/semesters\/1\/courses\/ramo\/anki\/n5\/cards\?/);
    expect(new URLSearchParams(link.getAttribute('href')!.split('?')[1]).get('unit')).toBeNull();
  });
});
