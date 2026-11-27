// Tests what the study screen shows of the session's state: when «Deshacer» can be used, the load warning's count and
// the screen of a session that waits for the connection and of one that stopped.

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fullAnkiStudy } from '../../../test/fakes/repositories';
import { DECK_PATH } from '../../../test/fixtures/deck';
import { cardText } from '../../../test/dom';
import { renderApp } from '../../../test/render';
import { ConnectionError, localStudyRepository } from '../../progress/api/repository';
import type { StudyRepository } from '../../progress/api/repository';

async function simpleStudent(): Promise<StudyRepository> {
  const study = localStudyRepository(null, { welcomeSeen: true });
  await study.setDeckActivations([{ deckId: '5', active: true }]);
  return study;
}

describe('the screen’s title', () => {
  it('is there for a screen reader while a card is shown, as the only one', async () => {
    renderApp(`${DECK_PATH}/study`, { study: await simpleStudent() });
    await cardText(/Frente de la tarjeta/);
    const titles = screen.getAllByRole('heading', { level: 1 });
    expect(titles).toHaveLength(1);
    expect(titles[0]).toHaveTextContent(/^Estudiar /);
    expect(titles[0]).toHaveClass('sr-only');
  });
});

describe('«Deshacer», when there is something to undo', () => {
  it('in the simple mode its button is on only after something was done, and off again once undone', async () => {
    renderApp(`${DECK_PATH}/study`, { study: await simpleStudent() });
    await cardText(/Frente de la tarjeta/);
    const undo = () => screen.getByRole('button', { name: 'Deshacer' });
    expect(undo()).toBeDisabled();
    fireEvent.keyDown(window, { key: ' ' });
    await cardText(/Reverso de la tarjeta/);
    expect(undo()).toBeDisabled();
    fireEvent.keyDown(window, { key: '2' });
    await waitFor(() => expect(undo()).toBeEnabled());
    await userEvent.click(undo());
    await waitFor(() => expect(undo()).toBeDisabled());
  });

  it('in the full mode its item of «Más» too', async () => {
    renderApp(`${DECK_PATH}/study`, { study: fullAnkiStudy() });
    await cardText(/Frente de la tarjeta/);
    const item = async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Más' }));
      const found = await screen.findByRole('menuitem', { name: /^Deshacer/ });
      return found;
    };
    expect(await item()).toHaveAttribute('aria-disabled', 'true');
    await userEvent.keyboard('{Escape}');
    fireEvent.keyDown(window, { key: ' ' });
    await cardText(/Reverso de la tarjeta/);
    fireEvent.keyDown(window, { key: '3' });
    await cardText(/Frente de la tarjeta/);
    await waitFor(async () => expect(await item()).not.toHaveAttribute('aria-disabled', 'true'));
  });
});

describe('the warning of a heavy day', () => {
  it('keeps the count the session opened with while the cards are answered', async () => {
    const study = await simpleStudent();
    study.medianAnswerMs = async () => 500_000;
    renderApp(`${DECK_PATH}/study`, { study });
    await cardText(/Frente de la tarjeta/);
    const warning = async () =>
      (await screen.findAllByRole('status'))
        .map((s) => s.textContent)
        .find((t) => /Hoy son \d+ tarjetas/.test(t));
    const opening = await warning();
    expect(opening).toMatch(/Hoy son 3 tarjetas/);
    fireEvent.keyDown(window, { key: ' ' });
    await cardText(/Reverso de la tarjeta/);
    fireEvent.keyDown(window, { key: '2' });
    await waitFor(async () => expect(await study.answersSince(new Date(0))).toHaveLength(1));
    expect(await warning()).toBe(opening);
  });
});

describe('a session that stopped because a save failed', () => {
  it('says why, asks to reload and no longer takes answers', async () => {
    const local = fullAnkiStudy();
    const failing: StudyRepository = {
      ...local,
      recordReview: () => Promise.reject(new Error('No se pudo guardar tu respuesta: red')),
    };
    renderApp(`${DECK_PATH}/study`, { study: failing });
    await cardText(/Frente de la tarjeta/);
    fireEvent.keyDown(window, { key: ' ' });
    await cardText(/Reverso de la tarjeta/);
    fireEvent.keyDown(window, { key: '3' });

    expect(await screen.findByText('Se detuvo la sesión')).toBeInTheDocument();
    expect(screen.getByText('No se pudo guardar tu respuesta: red')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Volver a cargar' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: ' ' });
    await cardText(/Reverso de la tarjeta/);
    for (const button of within(screen.getByRole('group', { name: 'Responder' })).getAllByRole(
      'button',
    )) {
      expect(button).toBeDisabled();
    }
    fireEvent.keyDown(window, { key: '3' });
    expect(screen.getByRole('region', { name: /Reverso de la tarjeta/ })).toBeInTheDocument();
  });
});

describe('a session without a connection', () => {
  it('goes on and says how much waits where it tells what is left; with too much waiting it takes no more', async () => {
    const local = fullAnkiStudy();
    let down = true;
    const offline: StudyRepository = {
      ...local,
      recordReview: (input) =>
        down ? Promise.reject(new ConnectionError('guardar')) : local.recordReview(input),
      setFlag: (card, flag) =>
        down ? Promise.reject(new ConnectionError('guardar')) : local.setFlag(card, flag),
    };
    renderApp(`${DECK_PATH}/study`, { study: offline });
    await cardText(/Frente de la tarjeta/);
    fireEvent.keyDown(window, { key: ' ' });
    await cardText(/Reverso de la tarjeta/);
    fireEvent.keyDown(window, { key: '3' });
    const waits = () => screen.getByRole('group', { name: 'Conexión' });
    await waitFor(() => expect(waits()).toHaveTextContent('Sin conexión · 1 por guardar'));
    expect(await screen.findByText(/^Sin conexión\. Puedes seguir/)).toBeInTheDocument();
    expect(screen.queryByText('Se detuvo la sesión')).not.toBeInTheDocument();
    await cardText(/Frente de la tarjeta/);

    for (let i = 0; i < 29; i++) fireEvent.keyDown(window, { key: '1', ctrlKey: true });
    expect(await screen.findByText(/hay 30 cambios sin guardar/)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: '1', ctrlKey: true });
    expect(waits()).toHaveTextContent('Sin conexión · 30 por guardar');
    await userEvent.click(screen.getByRole('button', { name: 'Más' }));
    for (const item of await screen.findAllByRole('menuitem', { name: /^(Deshacer|Enterrar)/ })) {
      expect(item).toHaveAttribute('aria-disabled', 'true');
    }
    await userEvent.keyboard('{Escape}');
    fireEvent.keyDown(window, { key: ' ' });
    await cardText(/Reverso de la tarjeta/);
    for (const button of within(screen.getByRole('group', { name: 'Responder' })).getAllByRole(
      'button',
    )) {
      expect(button).toBeDisabled();
    }

    down = false;
    window.dispatchEvent(new Event('online'));
    const left = await screen.findByRole('group', { name: 'Tarjetas que quedan' });
    expect(left).toHaveTextContent(/Nuevas: 2/);
    expect(await screen.findByText(/^Volvió la conexión/)).toBeInTheDocument();
    expect(screen.queryByText(/cambios sin guardar/)).not.toBeInTheDocument();
    expect(await local.answersSince(new Date(0))).toHaveLength(1);
    fireEvent.keyDown(window, { key: '3' });
    await waitFor(async () => expect(await local.answersSince(new Date(0))).toHaveLength(2));
  });

  it('left with answers waiting, a new session waits for them and then starts from what was saved', async () => {
    const local = fullAnkiStudy();
    let down = true;
    const offline: StudyRepository = {
      ...local,
      recordReview: (input) =>
        down ? Promise.reject(new ConnectionError('guardar')) : local.recordReview(input),
    };
    const { router } = renderApp(`${DECK_PATH}/study`, { study: offline });
    await cardText(/Frente de la tarjeta/);
    fireEvent.keyDown(window, { key: ' ' });
    await cardText(/Reverso de la tarjeta/);
    fireEvent.keyDown(window, { key: '3' });
    await screen.findByRole('group', { name: 'Conexión' });

    await router.navigate(DECK_PATH);
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Conexión' })).toBeNull());
    const leaving = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(leaving);
    expect(leaving.defaultPrevented).toBe(true);

    await router.navigate(`${DECK_PATH}/study`);
    expect(await screen.findByText(/^Guardando lo que respondiste antes/)).toBeInTheDocument();
    await router.navigate(DECK_PATH);
    await router.navigate(`${DECK_PATH}/study`);
    expect(await screen.findByText(/^Guardando lo que respondiste antes/)).toBeInTheDocument();
    down = false;
    window.dispatchEvent(new Event('online'));
    const left = await screen.findByRole('group', { name: 'Tarjetas que quedan' });
    expect(left).toHaveTextContent(/Nuevas: 2/);
    expect(await local.answersSince(new Date(0))).toHaveLength(1);
    const later = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(later);
    expect(later.defaultPrevented).toBe(false);
  });
});
