// Tests the final review's keyboard (space answers «Bien» once the answer is shown; a held key or a modifier does
// nothing), its mark for review and its report.

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DECK } from '../../../test/fixtures/deck';
import { renderApp } from '../../../test/render';
import { localStudyRepository } from '../../progress/api/repository';
import type { CardRef, StudyRepository } from '../../progress/api/repository';
import { cardText } from '../../../test/dom';

const REVIEW_PATH = '/semesters/1/courses/anatomia-1/anki/certamen-1/review';

async function seen(): Promise<StudyRepository> {
  const study = localStudyRepository(null, { welcomeSeen: true });
  await study.setDeckActivations([{ deckId: '5', active: true }]);
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

  it('the mark for review is put and taken away, and saved each time', async () => {
    const study = await seen();
    await startRound(study);
    const more = async (item: string) => {
      await userEvent.click(screen.getByRole('button', { name: 'Más' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: item }));
    };
    await more('Marcar para revisar');
    expect(await screen.findByRole('img', { name: 'Marcada para revisar' })).toBeInTheDocument();
    await waitFor(async () =>
      expect((await study.cards(['20'])).some((c) => c.flag !== 0)).toBe(true),
    );
    await more('Quitar la marca');
    await waitFor(() =>
      expect(screen.queryByRole('img', { name: 'Marcada para revisar' })).toBeNull(),
    );
    await waitFor(async () =>
      expect((await study.cards(['20'])).every((c) => c.flag === 0)).toBe(true),
    );
  });

  it('a report closed without sending thanks nobody, and one sent thanks', async () => {
    await startRound(await seen());
    const open = async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Más' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Reportar error' }));
      return screen.findByRole('dialog', { name: 'Reportar error' });
    };
    await userEvent.click(within(await open()).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText('Gracias: tu reporte le llegó al autor.')).toBeNull();
    const dialog = await open();
    await userEvent.type(within(dialog).getByLabelText('¿Qué está mal?'), 'Una falta');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('Gracias: tu reporte le llegó al autor.')).toBeInTheDocument();
  });
});
