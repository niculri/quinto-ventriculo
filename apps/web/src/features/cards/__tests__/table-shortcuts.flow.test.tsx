// Tests the keyboard of the cards page's table in «Modo avanzado»: moving and selecting in the grid, the page's
// shortcuts, the flag menu, «Olvidar…» and what an action says when it works or fails.

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp, fullAnkiStudy } from '../../../test/render';
import type { StudyRepository } from '../../progress/api/repository';

const TABLE = '/semesters/1/courses/anatomia-1/anki/certamen-1/cards?view=table';

const grid = () => screen.findByRole('grid', { name: /Tarjetas|Notas/ });
const rows = async () =>
  within(await grid())
    .getAllByRole('row')
    .slice(1);
const selected = async () => (await rows()).map((r) => r.getAttribute('aria-selected'));
const press = (key: string, init: Partial<KeyboardEventInit> = {}) =>
  act(async () => {
    fireEvent.keyDown(window, { key, ...init });
  });

describe('the table’s keyboard', () => {
  it('moves through the grid with the arrows, the pages, Home and End, and selects a range with Mayús', async () => {
    const { router } = renderApp(TABLE);
    const g = await grid();
    const note = () => new URLSearchParams(router.state.location.search).get('note');
    fireEvent.keyDown(g, { key: 'ArrowDown' });
    expect(await selected()).toEqual(['true', 'false', 'false', 'false']);
    expect(note()).toBe('s@/AqX%n?#');
    fireEvent.keyDown(g, { key: 'ArrowDown' });
    expect(await selected()).toEqual(['false', 'true', 'false', 'false']);
    fireEvent.keyDown(g, { key: 'ArrowDown', shiftKey: true });
    expect(await selected()).toEqual(['false', 'true', 'true', 'false']);
    expect(screen.getByText('4 tarjetas · 2 seleccionadas')).toBeInTheDocument();
    fireEvent.keyDown(g, { key: 'End' });
    expect(await selected()).toEqual(['false', 'false', 'false', 'true']);
    expect(note()).toBe('oclusion-1');
    fireEvent.keyDown(g, { key: 'Home' });
    expect(await selected()).toEqual(['true', 'false', 'false', 'false']);
    fireEvent.keyDown(g, { key: 'PageDown' });
    expect(await selected()).toEqual(['false', 'false', 'false', 'true']);
    fireEvent.keyDown(g, { key: 'ArrowUp' });
    expect(await selected()).toEqual(['false', 'false', 'true', 'false']);
    fireEvent.keyDown(g, { key: 'PageUp' });
    expect(await selected()).toEqual(['true', 'false', 'false', 'false']);
    fireEvent.keyDown(g, { key: 'a', ctrlKey: true });
    expect(await selected()).toEqual(['true', 'true', 'true', 'true']);
    expect(screen.getByText('4 tarjetas · 4 seleccionadas')).toBeInTheDocument();
    fireEvent.keyDown(g, { key: 'x' });
    expect(await selected()).toEqual(['true', 'true', 'true', 'true']);
  });

  it('Ctrl+F goes to the search; the shortcuts do nothing while typing in it', async () => {
    const study = fullAnkiStudy();
    renderApp(TABLE, { study });
    await userEvent.click((await rows())[0]!);
    await press('f', { ctrlKey: true });
    const box = screen.getByRole('searchbox', { name: 'Buscar (sintaxis de Anki)' });
    expect(box).toHaveFocus();
    fireEvent.keyDown(box, { key: 'j', ctrlKey: true });
    await new Promise((r) => setTimeout(r, 50));
    expect(await study.allCards()).toEqual([]);
    box.blur();
    await press('j');
    await new Promise((r) => setTimeout(r, 50));
    expect(await study.allCards()).toEqual([]);
  });

  it('Ctrl+J suspends and says so, and again takes it away; Ctrl+Mayús+J buries and unburies', async () => {
    const study = fullAnkiStudy();
    renderApp(TABLE, { study });
    await userEvent.click((await rows())[0]!);
    await press('j', { ctrlKey: true });
    expect(await screen.findByText('Suspendidas')).toBeInTheDocument();
    await waitFor(async () => expect((await study.allCards())[0]?.suspended).toBe(true));
    expect(screen.getByRole('button', { name: 'Quitar suspensión' })).toHaveAttribute(
      'aria-keyshortcuts',
      'Ctrl+J',
    );
    await press('j', { ctrlKey: true });
    expect(await screen.findByText('Se quitó la suspensión')).toBeInTheDocument();
    await waitFor(async () => expect((await study.allCards())[0]?.suspended).toBe(false));

    await userEvent.click((await rows())[3]!);
    await press('J', { ctrlKey: true, shiftKey: true });
    expect(await screen.findByText('Enterradas hasta mañana')).toBeInTheDocument();
    await waitFor(async () =>
      expect(
        (await study.allCards()).find((c) => c.noteGuid === 'oclusion-1')?.buriedUntil,
      ).not.toBeNull(),
    );
    expect(await screen.findByRole('button', { name: 'Desenterrar' })).toBeInTheDocument();
    await press('J', { ctrlKey: true, shiftKey: true });
    expect(await screen.findByText('Desenterradas')).toBeInTheDocument();
  });

  it('Ctrl+Z with nothing to undo says so', async () => {
    renderApp(TABLE, { study: fullAnkiStudy() });
    await grid();
    await press('z', { ctrlKey: true });
    expect(await screen.findByText('No hay nada que deshacer')).toBeInTheDocument();
  });

  it('the flag menu marks the selection with a color and takes it away; Ctrl+Alt+N asks before forgetting', async () => {
    const study = fullAnkiStudy();
    renderApp(TABLE, { study });
    await userEvent.click((await rows())[1]!);
    await userEvent.click(screen.getByRole('button', { name: 'Marcar' }));
    const items = await screen.findAllByRole('menuitemcheckbox');
    expect(items.map((i) => i.textContent)).toEqual([
      'RojoCtrl+1',
      'NaranjaCtrl+2',
      'VerdeCtrl+3',
      'AzulCtrl+4',
      'RosadoCtrl+5',
      'TurquesaCtrl+6',
      'MoradoCtrl+7',
    ]);
    await userEvent.click(items[1]!);
    expect(await screen.findByText('Marcadas')).toBeInTheDocument();
    await waitFor(async () => expect((await study.allCards())[0]?.flag).toBe(2));
    await userEvent.click(screen.getByRole('button', { name: 'Marcar' }));
    const again = await screen.findAllByRole('menuitemcheckbox');
    expect(again[1]).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(again[1]!);
    expect(await screen.findByText('Sin bandera')).toBeInTheDocument();
    await waitFor(async () => expect((await study.allCards())[0]?.flag).toBe(0));

    await press('n', { ctrlKey: true, altKey: true, code: 'KeyN' } as Partial<KeyboardEventInit>);
    const dialog = await screen.findByRole('dialog', { name: 'Olvidar' });
    expect(dialog).toHaveTextContent(
      'La tarjeta vuelve a ser nueva, en su posición original, sin su historial de memoria. El historial de repasos se conserva.',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Olvidar' })).toBeNull());

    const user = userEvent.setup();
    await user.keyboard('{Control>}');
    await user.click((await rows())[2]!);
    await user.keyboard('{/Control}');
    await userEvent.click(screen.getByRole('button', { name: 'Olvidar…' }));
    expect(await screen.findByRole('dialog', { name: 'Olvidar' })).toHaveTextContent(
      'Las 2 tarjetas vuelven a ser nuevas',
    );
  });

  it('an action that fails says why and lets the buttons be used again', async () => {
    const study = fullAnkiStudy();
    const failing: StudyRepository = {
      ...study,
      async suspend() {
        throw new Error('Sin conexión');
      },
    };
    renderApp(TABLE, { study: failing });
    await userEvent.click((await rows())[0]!);
    await userEvent.click(screen.getByRole('button', { name: 'Suspender' }));
    expect(await screen.findByText('No se pudo hacer')).toBeInTheDocument();
    expect(screen.getByText('Sin conexión')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Suspender' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Enterrar' }));
    await waitFor(() => expect(screen.queryByText('No se pudo hacer')).toBeNull());
  });

  it('without a selection the actions are off, but «Deshacer» is not', async () => {
    renderApp(TABLE);
    await grid();
    for (const name of ['Suspender', 'Enterrar', 'Marcar', 'Olvidar…']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: 'Deshacer' })).toBeEnabled();
    expect(screen.queryByRole('link', { name: 'Ir al mazo' })).toBeNull();
  });
});
