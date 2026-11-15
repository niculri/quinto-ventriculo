// Tests studying a deck in the full mode: answers, keys, undo and limits.

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DECK_PATH, renderApp, fullAnkiStudy } from '../../../test/render';
import { cardShadowRoot } from '../../decks/components/CardFrame';
import type { StudyRepository } from '../../progress/api/repository';

async function cardText(label: RegExp) {
  const region = await screen.findByRole('region', { name: label });
  await waitFor(() => expect(cardShadowRoot(region)?.querySelector('.card')).toBeTruthy());
  return cardShadowRoot(region)!.querySelector('.card')!.textContent ?? '';
}

function counts() {
  const group = screen.getByRole('group', { name: 'Tarjetas que quedan' });
  return [/Nuevas/, /Aprendiendo/, /A repasar/].map((name) =>
    Number(within(group).getByTitle(name.source).textContent!.replace(/\D/g, '')),
  );
}

async function startStudying(study: StudyRepository = fullAnkiStudy()) {
  const r = renderApp(`${DECK_PATH}/study`, { study });
  await cardText(/Frente de la tarjeta/);
  expect(screen.getByRole('link', { name: 'Volver a Anatomía I · Certamen 1' })).toHaveAttribute(
    'href',
    DECK_PATH,
  );
  return { ...r, study };
}

describe('studying', () => {
  it('front, «Mostrar respuesta», the four buttons with their intervals, and the next card', async () => {
    const { study } = await startStudying();
    expect(await cardText(/Frente/)).toContain('¿Cuántas vértebras cervicales hay?');
    expect(counts()).toEqual([3, 0, 0]);
    expect(screen.getByTitle('Nuevas')).toHaveClass('underline');

    await userEvent.click(screen.getByRole('button', { name: 'Mostrar respuesta' }));
    expect(await cardText(/Reverso/)).toContain('7');
    const answer = screen.getByRole('group', { name: 'Responder' });
    expect(
      within(answer)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual([
      'Otra vez (<1 m)',
      'Difícil (<6 m)',
      'Bien (<10 m)',
      expect.stringMatching(/^Fácil \(\d+ d\)$/),
    ]);

    await userEvent.click(within(answer).getByRole('button', { name: /^Bien/ }));
    expect(await cardText(/Frente/)).toContain('La columna tiene');
    expect(counts()).toEqual([2, 1, 0]);
    await waitFor(async () =>
      expect(await study.cards(['20', '21'])).toEqual([
        expect.objectContaining({ noteGuid: 's@/AqX%n?#', phase: 'learning', remainingSteps: 1 }),
      ]),
    );
  });

  it('keyboard: space shows the answer and answers «Bien», 1–4 answer, Ctrl+Z undoes', async () => {
    const { study } = await startStudying();
    await userEvent.keyboard(' ');
    await cardText(/Reverso/);
    await userEvent.keyboard('1');
    expect(await cardText(/Frente/)).toContain('La columna tiene');
    expect(counts()).toEqual([2, 1, 0]);

    await userEvent.keyboard('{Control>}z{/Control}');
    expect(await cardText(/Frente/)).toContain('¿Cuántas vértebras');
    expect(counts()).toEqual([3, 0, 0]);
    expect(screen.getByText('Deshecho: Responder tarjeta')).toBeInTheDocument();
    await waitFor(async () => expect(await study.cards(['20', '21'])).toEqual([]));

    await userEvent.keyboard(' ');
    await cardText(/Reverso/);
    await userEvent.keyboard(' ');
    expect(await cardText(/Frente/)).toContain('La columna tiene');
  });

  it('bury, suspend and flag from the keyboard, and undo them', async () => {
    const { study } = await startStudying();
    await userEvent.keyboard('-');
    expect(await cardText(/Frente/)).toContain('La columna tiene');
    expect(screen.getByText('Tarjeta enterrada.')).toBeInTheDocument();
    expect(counts()).toEqual([2, 0, 0]);

    fireEvent.keyDown(window, { key: '@' });
    expect(await screen.findByText('Tarjeta suspendida.')).toBeInTheDocument();
    expect(counts()).toEqual([1, 0, 0]);

    fireEvent.keyDown(window, { key: '3', ctrlKey: true });
    expect(await screen.findByLabelText('Marcador verde')).toBeInTheDocument();
    await waitFor(async () =>
      expect((await study.cards(['20'])).map((c) => [c.noteGuid, c.flag, c.suspended])).toEqual([
        ['s@/AqX%n?#', 0, false],
        ['cloze-1', 0, true],
        ['oclusion-1', 3, false],
      ]),
    );

    for (let i = 0; i < 3; i++) fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    await waitFor(() => expect(counts()).toEqual([3, 0, 0]));
    expect(await cardText(/Frente/)).toContain('¿Cuántas vértebras');
    await waitFor(async () => expect(await study.cards(['20', '21'])).toEqual([]));
  });

  it('shortcuts by their character (Spanish keyboards), not the browser’s, not on a held key', async () => {
    await startStudying();
    fireEvent.keyDown(window, { key: '-', ctrlKey: true });
    fireEvent.keyDown(window, { key: ' ' });
    fireEvent.keyDown(window, { key: ' ', repeat: true });
    fireEvent.keyDown(window, { key: ' ', repeat: true });
    expect(await cardText(/Reverso/)).toContain('7');
    expect(counts()).toEqual([3, 0, 0]);
    // «@» is Alt+2 on a Mac with a Spanish keyboard, and AltGr (Ctrl+Alt) on Windows.
    fireEvent.keyDown(window, { key: '@', altKey: true });
    expect(await screen.findByText('Tarjeta suspendida.')).toBeInTheDocument();
    expect(counts()).toEqual([2, 0, 0]);
    fireEvent.keyDown(window, { key: '@', ctrlKey: true, altKey: true });
    await waitFor(() => expect(counts()).toEqual([1, 0, 0]));
  });

  it('«Más» does the same as the shortcuts, for the phone', async () => {
    await startStudying();
    await userEvent.click(screen.getByRole('button', { name: 'Más' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Enterrar nota/ }));
    expect(await screen.findByText('Nota enterrada.')).toBeInTheDocument();
    expect(await cardText(/Frente/)).toContain('La columna tiene');
  });

  it('when nothing is left: congratulations, and when the next card comes', async () => {
    await startStudying();
    for (let i = 0; i < 3; i++) {
      await userEvent.keyboard(' ');
      await cardText(/Reverso/);
      await userEvent.keyboard('4');
    }
    expect(
      await screen.findByRole('heading', {
        name: '¡Felicitaciones! Has finalizado este mazo por ahora.',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Una o más tarjetas fueron enterradas y se mostrarán mañana.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Programadas para mañana: 0')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver al mazo' })).toHaveAttribute('href', DECK_PATH);
  });

  it('studying from the assessment or the course studies everything below, with each level’s limits', async () => {
    const study = fullAnkiStudy();
    const c1 = renderApp('/semesters/1/courses/anatomia-1/anki/certamen-1/study', { study });
    expect(await cardText(/Frente/)).toContain('¿Cuántas vértebras');
    expect(counts()).toEqual([3, 0, 0]);
    const back = screen.getByRole('link', { name: 'Volver a Anatomía I · Certamen 1' });
    expect(back).toHaveAttribute('href', '/semesters/1/courses/anatomia-1/anki/certamen-1');
    expect(back).toHaveAttribute('title', 'Anatomía I · Certamen 1');
    await userEvent.keyboard(' ');
    await cardText(/Reverso/);
    await userEvent.keyboard('4');
    await waitFor(() => expect(counts()).toEqual([2, 0, 0]));
    c1.unmount();
    renderApp('/semesters/1/courses/anatomia-1/anki/study', { study });
    expect(await cardText(/Frente/)).toContain('La columna tiene');
    expect(counts()).toEqual([2, 0, 0]);
    expect(screen.getByRole('link', { name: 'Volver a Anatomía I' })).toHaveAttribute(
      'href',
      '/semesters/1/courses/anatomia-1/anki',
    );
  });

  it('what was studied is kept: coming back continues where it was left', async () => {
    const study = fullAnkiStudy();
    const first = await startStudying(study);
    await userEvent.keyboard(' ');
    await cardText(/Reverso/);
    await userEvent.keyboard('4');
    await cardText(/Frente/);
    first.unmount();

    await startStudying(study);
    expect(counts()).toEqual([2, 0, 0]);
    expect(await cardText(/Frente/)).toContain('La columna tiene');
    await act(async () => {
      fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    });
    expect(await screen.findByText('No hay nada que deshacer')).toBeInTheDocument();
    expect(counts()).toEqual([2, 0, 0]);
    expect(await cardText(/Frente/)).toContain('La columna tiene');
  });
});
