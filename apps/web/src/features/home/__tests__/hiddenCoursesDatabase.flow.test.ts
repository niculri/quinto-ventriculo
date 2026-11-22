// Tests that turning courses off and on leaves the student's rows in the users database as they were, through the
// Supabase adapters over the real SQL (PGlite).
import { screen, within } from '@testing-library/react';
import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '@qv/db-types/users';
import { fakeSupabase, signIn } from '@qv/db/postgrest';
import { createDatabase } from '@qv/db/testing';
import { withoutCourses } from '@qv/schema';
import { DATABASE_TIMEOUT } from '../../../test/contract';
import { fakeApi } from '../../../test/fakes/api';
import { CATALOG } from '../../../test/fixtures/catalog';
import { renderApp } from '../../../test/render';
import { defaultPreferences, supabaseStudyRepository } from '../../progress/api/repository';
import { supabaseQuizRepository } from '../../quiz/api/repository';

// A Tuesday of November, at noon in Santiago.
const NOW = new Date('2026-11-10T12:00:00-03:00');

type PGlite = Awaited<ReturnType<typeof createDatabase>>;
let db: PGlite;

beforeAll(async () => {
  db = await createDatabase('users');
}, DATABASE_TIMEOUT);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

async function student() {
  const me = await signIn(db, 'estudiante-ramos@ug.uchile.cl');
  const rest = fakeSupabase(db, () => me);
  const client = createClient<Database>(rest.url, rest.key, rest.options);
  const study = supabaseStudyRepository(client);
  const quiz = supabaseQuizRepository(client);
  // The browser's own zone: the site saves it on opening, and this test is not about that.
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  await study.savePreferences({ ...defaultPreferences(zone), welcomeSeen: true });
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
  const roundId = '00000000-0000-4000-8000-000000000001';
  await quiz.save({
    quizId: 'practica-biocel',
    sectionId: 'pautas',
    round: { id: roundId },
    roundInfo: {
      id: roundId,
      origin: 'cover',
      questionCount: 4,
      shuffled: false,
      shuffleOptions: true,
      startedAt: '2026-11-09T12:00:00.000Z',
      finished: false,
    },
    answer: {
      roundId,
      questionId: 'p0',
      position: 0,
      chosen: 1,
      correct: true,
      answeredAt: '2026-11-09T12:01:00.000Z',
    },
  });
  return { study, quiz };
}

describe('turning courses off and on, with the rows in the users database', () => {
  it('leaves what the student saved as it was, and the home page as it was when they come back', async () => {
    const { study, quiz } = await student();
    let off = false;
    const api = fakeApi({
      catalog: async () =>
        off ? withoutCourses(CATALOG, new Set(['anatomia-1', 'biologia-celular'])) : CATALOG,
    });
    const rows = async () => ({
      answered: await study.answeredDecks(),
      cards: await study.allCards(),
      activations: await study.deckActivations(),
      settings: await study.assessmentSettings(),
      preferences: await study.preferences(),
      rounds: await quiz.openRounds(),
      saved: await quiz.load('practica-biocel'),
    });
    const home = async () => {
      const view = renderApp('/home', { api, study, quiz });
      const today = await screen.findByRole('region', { name: 'Hoy' });
      await within(today).findByText(/Anatomía I/);
      return view;
    };

    const before = await rows();
    expect(before.cards).toHaveLength(1);
    expect(before.rounds).toHaveLength(1);
    expect(before.settings).toHaveLength(1);
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
    expect(await rows()).toEqual(before);
    hidden.unmount();

    off = false;
    const back = await home();
    expect((await screen.findByRole('main')).textContent).toBe(withCourses);
    expect(await rows()).toEqual(before);
    back.unmount();
  });
});
