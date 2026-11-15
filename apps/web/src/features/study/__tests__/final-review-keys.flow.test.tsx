// Tests the final review's keyboard (space answers «Bien» once the answer is shown; a held key or a modifier does
// nothing) and a mark that cannot be saved.

import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DECK, renderApp } from '../../../test/render';
import { cardShadowRoot } from '../../decks/CardFrame';
import { localStudyRepository } from '../../progress/api/repository';
import type { CardRef, StudyRepository } from '../../progress/api/repository';

const REVIEW_PATH = '/semesters/1/courses/anatomia-1/anki/certamen-1/review';

async function cardText(label: RegExp) {
  const region = await screen.findByRole('region', { name: label });
  await waitFor(() => expect(cardShadowRoot(region)?.querySelector('.card')).toBeTruthy());
  return cardShadowRoot(region)!.querySelector('.card')!.textContent ?? '';
}

async function seen(): Promise<StudyRepository> {
  const study = localStudyRepository(null, { welcomeSeen: true });
  await study.setDeckActivation('5', true);
  const refs: CardRef[] = DECK.cards
    .filter((c) => c.deckId === '20')
    .map((c) => ({ noteGuid: c.noteGuid, ord: c.ord, deckId: c.deckId }));
  const now = Date.now();
  for (const card of refs) {
    await study.recordReview({
      card,
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
        difficulty: 3,
        reps: 1,
        lapses: 0,
        lastReview: new Date(now - 1000).toISOString(),
        suspended: false,
        leech: false,
      },
      bury: [],
      buriedUntil: null,
    });
  }
  return study;
}

async function startRound(study: StudyRepository) {
  renderApp(REVIEW_PATH, { study });
  await userEvent.click(await screen.findByRole('button', { name: /^Todo lo visto/ }));
  await cardText(/Frente de la tarjeta/);
}

describe('the final review’s keyboard', () => {
  it('space shows the answer and then answers «Bien»; a held key and a modifier do nothing', async () => {
    await startRound(await seen());
    expect(screen.getByText('Repaso final · quedan 3')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: ' ', ctrlKey: true });
    fireEvent.keyDown(window, { key: ' ', repeat: true });
    expect(screen.queryByRole('region', { name: /Reverso/ })).toBeNull();
    fireEvent.keyDown(window, { key: ' ' });
    await cardText(/Reverso de la tarjeta/);
    fireEvent.keyDown(window, { key: ' ', repeat: true });
    fireEvent.keyDown(window, { key: '2', altKey: true });
    expect(screen.getByText('Repaso final · quedan 3')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(await screen.findByText('Repaso final · quedan 2')).toBeInTheDocument();
    await cardText(/Frente de la tarjeta/);
  });

  it('a mark that cannot be saved goes back, and says so', async () => {
    const study = await seen();
    study.setFlag = () => Promise.reject(new Error('offline'));
    await startRound(study);
    await userEvent.click(screen.getByRole('button', { name: 'Más' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Marcar para revisar' }));
    expect(await screen.findByText('No se pudo guardar la marca.')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Marcada para revisar' })).toBeNull();
  });
});
