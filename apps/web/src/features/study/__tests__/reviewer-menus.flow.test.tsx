// Tests the menus of the study screen in both modes: hiding, flagging and reporting a card from «Más», and the thanks
// after a report.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fullAnkiStudy } from '../../../test/fakes/repositories';
import { DECK_PATH } from '../../../test/fixtures/deck';
import { renderApp } from '../../../test/render';
import { localStudyRepository } from '../../progress/api/repository';
import type { StudyRepository } from '../../progress/api/repository';
import { cardText } from '../../../test/dom';

async function simpleStudent(): Promise<StudyRepository> {
  const study = localStudyRepository(null, { welcomeSeen: true });
  await study.setDeckActivation('5', true);
  return study;
}

async function fromMore(item: string) {
  await userEvent.click(screen.getByRole('button', { name: 'Más' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${item}`) }));
}

async function report() {
  const dialog = await screen.findByRole('dialog', { name: 'Reportar error' });
  await userEvent.type(within(dialog).getByLabelText('¿Qué está mal?'), 'Una falta');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar' }));
  expect(await screen.findByText('Gracias: tu reporte le llegó al autor.')).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).toBeNull();
}

describe('«Más» in the full mode', () => {
  it('buries the card and the note, and suspends them', async () => {
    const study = fullAnkiStudy();
    renderApp(`${DECK_PATH}/study`, { study });
    expect(await cardText(/Frente/)).toContain('¿Cuántas vértebras');
    await fromMore('Enterrar tarjeta');
    expect(await screen.findByText('Tarjeta enterrada.')).toBeInTheDocument();
    expect(await cardText(/Frente/)).toContain('La columna tiene');
    await fromMore('Enterrar nota');
    expect(await screen.findByText('Nota enterrada.')).toBeInTheDocument();
    await fromMore('Suspender nota');
    expect(await screen.findByText('La nota se ha suspendido.')).toBeInTheDocument();
    await waitFor(async () =>
      expect(
        (await study.cards(['20'])).map((c) => [c.noteGuid, !!c.buriedUntil, c.suspended]),
      ).toEqual([
        ['s@/AqX%n?#', true, false],
        ['cloze-1', true, false],
        ['oclusion-1', false, true],
      ]),
    );
  });

  it('suspends the card, and undoes from the menu', async () => {
    const study = fullAnkiStudy();
    renderApp(`${DECK_PATH}/study`, { study });
    await cardText(/Frente/);
    await fromMore('Suspender tarjeta');
    expect(await screen.findByText('Tarjeta suspendida.')).toBeInTheDocument();
    await fromMore('Deshacer');
    expect(await screen.findByText('Deshecho: Suspender tarjeta')).toBeInTheDocument();
    expect(await cardText(/Frente/)).toContain('¿Cuántas vértebras');
  });

  it('flags the card from its submenu, and the flag is shown on top', async () => {
    const study = fullAnkiStudy();
    renderApp(`${DECK_PATH}/study`, { study });
    await cardText(/Frente/);
    await userEvent.click(screen.getByRole('button', { name: 'Más' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Marcar tarjeta' }));
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: /^Azul/ }));
    expect(await screen.findByRole('img', { name: 'Marcador azul' })).toBeInTheDocument();
    await waitFor(async () => expect((await study.cards(['20']))[0]?.flag).toBe(4));
  });

  it('has the deck’s options and reports the card', async () => {
    renderApp(`${DECK_PATH}/study`, { study: fullAnkiStudy() });
    await cardText(/Frente/);
    await userEvent.click(screen.getByRole('button', { name: 'Más' }));
    expect(await screen.findByRole('menuitem', { name: 'Opciones' })).toHaveAttribute(
      'href',
      expect.stringContaining('deck='),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'Reportar error' }));
    await report();
  });
});

describe('«Más» in the simple mode', () => {
  it('reports the card', async () => {
    renderApp(`${DECK_PATH}/study`, { study: await simpleStudent() });
    await cardText(/Frente/);
    await fromMore('Reportar error');
    await report();
  });

  it('marks the card for review and takes the mark away', async () => {
    const study = await simpleStudent();
    renderApp(`${DECK_PATH}/study`, { study });
    await cardText(/Frente/);
    await fromMore('Marcar para revisar');
    expect(await screen.findByRole('img', { name: 'Marcada para revisar' })).toBeInTheDocument();
    await fromMore('Quitar la marca');
    await waitFor(() =>
      expect(screen.queryByRole('img', { name: 'Marcada para revisar' })).toBeNull(),
    );
  });
});
