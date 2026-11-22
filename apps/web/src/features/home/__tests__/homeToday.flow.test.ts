// Tests the home page when its counts or its parts fall back: «Hoy» from each course's deck, a deck that does not
// load, tests half done that do not come, a site without decks, and the preferences shown while they save.

import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeApi } from '../../../test/fakes/api';
import { fullAnkiStudy } from '../../../test/fakes/repositories';
import { CATALOG } from '../../../test/fixtures/catalog';
import { chooseIn } from '../../../test/dom';
import { renderApp } from '../../../test/render';
import { ApiRequestError } from '../../../shared/lib/api';
import { localStudyRepository } from '../../progress/api/repository';
import type { StudyPreferences } from '../../progress/api/repository';
import { localQuizRepository } from '../../quiz/api/repository';
import { DECK } from '../../../test/fixtures/deck';

/** Too many cards due for the home counts: each course of «Hoy» then counts with its own deck. */
function truncated() {
  const study = fullAnkiStudy();
  study.homeCounts = async () => ({ truncated: true, decks: [] });
  return study;
}

describe('«Hoy» when the home counts cannot know the new cards', () => {
  it('each course counts with its deck, as its page does, and offers «Estudiar»', async () => {
    renderApp('/home', { study: truncated() });
    const today = await screen.findByRole('region', { name: 'Hoy' });
    const study = await within(today).findByRole('link', { name: /Estudiar/ });
    expect(study).toHaveAttribute('href', '/semesters/1/courses/anatomia-1/anki/study');
    expect(within(today).getByRole('button', { name: /para hoy/ })).toBeInTheDocument();
    expect(today.querySelector('[data-mastery]')).not.toBeNull();
  });

  it('a deck that does not load says so in its row, without «Estudiar»', async () => {
    const api = fakeApi({
      deck: async () => {
        throw new ApiRequestError(500, 'internal', 'Falló el servidor.');
      },
    });
    renderApp('/home', { study: truncated(), api });
    const today = await screen.findByRole('region', { name: 'Hoy' });
    expect(await within(today).findByText('No se pudo cargar.')).toBeInTheDocument();
    expect(within(today).queryByRole('link', { name: /Estudiar/ })).toBeNull();
    expect(within(today).getByRole('link', { name: /Anatomía I/ })).toBeInTheDocument();
  });
});

describe('«Hoy» with a course answered but nothing on', () => {
  it('offers to choose what to study in that course, not «Listo por hoy»', async () => {
    const study = localStudyRepository(null, { welcomeSeen: true });
    const card = DECK.cards.find((c) => c.deckId === '20')!;
    const now = Date.now();
    await study.recordReview({
      card: { noteGuid: card.noteGuid, ord: card.ord, deckId: card.deckId },
      expectedUpdatedAt: null,
      rating: 3,
      queueBefore: 'new',
      interval: 2,
      lastInterval: 0,
      durationMs: 4000,
      state: {
        phase: 'review',
        interday: true,
        remainingSteps: 0,
        due: new Date(now + 2 * 86_400_000).toISOString(),
        interval: 2,
        stability: 2.3,
        difficulty: 5,
        reps: 1,
        lapses: 0,
        lastReview: new Date(now).toISOString(),
        suspended: false,
        leech: false,
      },
      bury: [],
    });
    await study.setDeckActivation('5', false);
    renderApp('/home', { study });
    const today = await screen.findByRole('region', { name: 'Hoy' });
    const choose = await within(today).findByRole('link', { name: 'Elegir qué estudiar' });
    expect(choose).toHaveAttribute('href', '/semesters/1/courses/anatomia-1');
    expect(within(today).queryByText('Listo por hoy')).toBeNull();
  });
});

describe('the rest of the home page', () => {
  it('choosing «Elige tu semestre» again saves nothing', async () => {
    const study = localStudyRepository(null, { welcomeSeen: true });
    renderApp('/home', { study });
    const mine = await screen.findByRole('region', { name: 'Tus ramos' });
    await chooseIn(
      within(mine).getByRole('button', { name: /¿En qué semestre estás\?/ }),
      'Elige tu semestre',
    );
    expect((await study.preferences())?.semester ?? null).toBeNull();
  });

  it('tests half done that do not come leave out «Seguir», and the rest shows', async () => {
    const quiz = localQuizRepository(null);
    quiz.openRounds = () => Promise.reject(new Error('sin red'));
    renderApp('/home', { quiz });
    expect(await screen.findByRole('region', { name: 'Hoy' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Tus ramos' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Seguir' })).toBeNull();
  });

  it('a site without decks has no calendar of study days', async () => {
    const withDecks = renderApp('/home');
    expect(await screen.findByRole('heading', { name: 'Días de estudio' })).toBeInTheDocument();
    withDecks.unmount();
    const catalog = { ...CATALOG, anki: { ...CATALOG.anki, decks: [] } };
    renderApp('/home', { api: fakeApi({ catalog: async () => catalog }) });
    expect(await screen.findByRole('region', { name: 'Tus ramos' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Días de estudio' })).toBeNull();
  });

  it('«Tus ramos» shows the chosen semester while it is saved, and keeps it after', async () => {
    const study = localStudyRepository(null, { welcomeSeen: true });
    const save = study.savePreferences.bind(study);
    let finish = () => {};
    study.savePreferences = (p: StudyPreferences) =>
      new Promise<void>((resolve) => {
        finish = () => void save(p).then(resolve);
      });
    renderApp('/home', { study });
    const mine = await screen.findByRole('region', { name: 'Tus ramos' });
    await chooseIn(
      within(mine).getByRole('button', { name: /¿En qué semestre estás\?/ }),
      '2° Semestre',
    );
    expect(await within(mine).findByRole('link', { name: /Biología celular/ })).toBeInTheDocument();
    expect((await study.preferences())?.semester ?? null).toBeNull();
    finish();
    await waitFor(async () => expect((await study.preferences())?.semester).toBe(2));
    expect(within(mine).getByRole('link', { name: /Biología celular/ })).toBeInTheDocument();
  });
});
