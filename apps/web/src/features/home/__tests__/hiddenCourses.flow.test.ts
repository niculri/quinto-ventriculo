// Tests that turning courses off and on again leaves the student's progress as it was: the cards answered, the week on,
// the date of the exam and a test half done. The site hides them from the catalog; nothing of the student's changes.
import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withoutCourses } from '@qv/schema';
import { fakeApi } from '../../../test/fakes/api';
import { CATALOG } from '../../../test/fixtures/catalog';
import { renderApp } from '../../../test/render';
import { localStudyRepository } from '../../progress/api/repository';
import { localQuizRepository } from '../../quiz/api/repository';

// A Tuesday of November, at noon in Santiago.
const NOW = new Date('2026-11-10T12:00:00-03:00');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

async function student() {
  const study = localStudyRepository(null, { welcomeSeen: true });
  await study.setDeckActivation('5', true);
  await study.saveAssessmentSetting({
    deckId: '4',
    includeExtras: false,
    newPerDay: 7,
    examDate: '2026-11-25',
  });
  await study.recordReview({
    card: { noteGuid: 's@/AqX%n?#', ord: 0, deckId: '20' },
    expectedUpdatedAt: null,
    rating: 3,
    queueBefore: 'new',
    interval: -600,
    lastInterval: 0,
    durationMs: 3000,
    state: {
      phase: 'learning',
      interday: false,
      remainingSteps: 1,
      due: new Date(Date.now() + 600_000).toISOString(),
      interval: 0,
      stability: 2,
      difficulty: 5,
      reps: 1,
      lapses: 0,
      lastReview: new Date().toISOString(),
      suspended: false,
      leech: false,
    },
    bury: [],
    buriedUntil: null,
  });
  const quiz = localQuizRepository(null);
  quiz.openRounds = async () => [
    {
      quizId: 'practica-biocel',
      sectionId: 'pautas',
      answered: 2,
      questionCount: 4,
      updatedAt: '2026-11-09T12:00:00.000Z',
    },
  ];
  return { study, quiz };
}

describe('turning courses off and on', () => {
  it('leaves what the student did as it was, and the home page as it was when they come back', async () => {
    const { study, quiz } = await student();
    let off = false;
    const api = fakeApi({
      catalog: async () =>
        off ? withoutCourses(CATALOG, new Set(['anatomia-1', 'biologia-celular'])) : CATALOG,
    });
    const progress = async () => ({
      answered: await study.answeredDecks(),
      cards: await study.allCards(),
      activations: await study.deckActivations(),
      settings: await study.assessmentSettings(),
      rounds: await quiz.openRounds(),
    });
    const home = async () => {
      const view = renderApp('/home', { api, study, quiz });
      const today = await screen.findByRole('region', { name: 'Hoy' });
      await within(today).findByText(/Anatomía I/);
      return view;
    };

    const before = await progress();
    const first = await home();
    const withCourses = (await screen.findByRole('main')).textContent;
    expect(await screen.findByRole('region', { name: 'Seguir' })).toBeInTheDocument();
    first.unmount();

    off = true;
    const hidden = renderApp('/home', { api, study, quiz });
    await screen.findByRole('heading', { level: 1 });
    await screen.findByRole('region', { name: 'Tus ramos' });
    expect(screen.queryByRole('region', { name: 'Seguir' })).toBeNull();
    expect(screen.queryByText(/Anatomía I|Biología celular/)).toBeNull();
    expect(await progress()).toEqual(before);
    hidden.unmount();

    off = false;
    const back = await home();
    expect((await screen.findByRole('main')).textContent).toBe(withCourses);
    expect(await progress()).toEqual(before);
    back.unmount();
  });
});
