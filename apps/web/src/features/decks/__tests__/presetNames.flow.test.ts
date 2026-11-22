// Tests naming a preset in «Configuración de mazos»: renaming one's own, the names it refuses, and closing the dialogs.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '@qv/srs';
import { fullAnkiStudy } from '../../../test/fakes/repositories';
import { renderApp } from '../../../test/render';

async function withTwo() {
  const study = fullAnkiStudy();
  const mine = await study.savePreset({
    name: 'Mía',
    replaces: null,
    config: { ...defaultConfig() },
  });
  await study.savePreset({ name: 'Otra', replaces: null, config: { ...defaultConfig() } });
  return { study, mine };
}

async function openAction(name: string) {
  await userEvent.click(screen.getByRole('button', { name: 'Acciones de la configuración' }));
  await userEvent.click(await screen.findByRole('menuitem', { name }));
}

const nameField = () => screen.getByRole('textbox', { name: 'Nombre' });
const alert = () => nameField().closest('form')!.querySelector('[role="alert"]')!;

describe('the name of a preset', () => {
  it("renames one's own preset with the pencil", async () => {
    const { study, mine } = await withTwo();
    renderApp(`/settings/deck-options?preset=${mine.id}`, { study });
    await userEvent.click(await screen.findByRole('button', { name: 'Editar el nombre' }));
    expect(nameField()).not.toHaveAttribute('readonly');
    await userEvent.clear(nameField());
    await userEvent.type(nameField(), '  Nueva  {Enter}');
    await waitFor(async () =>
      expect((await study.presets()).map((p) => p.name)).toEqual(['Nueva', 'Otra']),
    );
    expect(await screen.findByRole('button', { name: 'Editar el nombre' })).toBeInTheDocument();
  });

  it('refuses an empty name or one another preset has, and says why until the text changes', async () => {
    const { study, mine } = await withTwo();
    renderApp(`/settings/deck-options?preset=${mine.id}`, { study });
    await userEvent.click(await screen.findByRole('button', { name: 'Editar el nombre' }));
    await userEvent.clear(nameField());
    await userEvent.type(nameField(), 'Otra{Enter}');
    expect(alert()).toHaveTextContent('Ya hay una configuración con ese nombre.');
    await userEvent.type(nameField(), '!');
    expect(alert()).toHaveTextContent('Usa el lápiz para cambiarle el nombre.');
    await userEvent.clear(nameField());
    await userEvent.type(nameField(), '   {Enter}');
    expect(alert()).toHaveTextContent('Ponle un nombre.');
    expect((await study.presets()).map((p) => p.name)).toEqual(['Mía', 'Otra']);
  });

  it('the same name, Escape or «Cancelar» leave the editing without saving, back to the name it had', async () => {
    const { study, mine } = await withTwo();
    renderApp(`/settings/deck-options?preset=${mine.id}`, { study });
    const edit = async () =>
      userEvent.click(await screen.findByRole('button', { name: 'Editar el nombre' }));

    await edit();
    await userEvent.type(nameField(), ' {Enter}');
    expect(nameField()).toHaveAttribute('readonly');
    expect(nameField()).toHaveValue('Mía');

    await edit();
    await userEvent.clear(nameField());
    await userEvent.type(nameField(), 'Otra{Enter}');
    await userEvent.keyboard('{Escape}');
    expect(nameField()).toHaveValue('Mía');
    expect(alert()).toHaveTextContent('Usa el lápiz para cambiarle el nombre.');

    await edit();
    await userEvent.type(nameField(), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(nameField()).toHaveValue('Mía');
    expect((await study.presets()).map((p) => p.name)).toEqual(['Mía', 'Otra']);
  });

  it('Escape in a read-only name does nothing', async () => {
    const { study, mine } = await withTwo();
    renderApp(`/settings/deck-options?preset=${mine.id}`, { study });
    await screen.findByRole('button', { name: 'Editar el nombre' });
    nameField().focus();
    await userEvent.keyboard('{Escape}');
    expect(nameField()).toHaveAttribute('readonly');
  });
});

describe('the dialogs of the presets close with Escape, changing nothing', () => {
  it('«Agregar configuración» and «Remover configuración»', async () => {
    const { study, mine } = await withTwo();
    renderApp(`/settings/deck-options?preset=${mine.id}`, { study });
    await screen.findByRole('button', { name: 'Editar el nombre' });
    await openAction('Agregar configuración');
    const add = await screen.findByRole('dialog', { name: 'Agregar configuración' });
    await userEvent.type(within(add).getByLabelText('Nombre'), 'Tercera');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await openAction('Remover configuración');
    await screen.findByRole('dialog', { name: '¿Remover Mía?' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await study.presets()).map((p) => p.name)).toEqual(['Mía', 'Otra']);
  });

  it('the removal says how many decks go back when several use it', async () => {
    const { study, mine } = await withTwo();
    await study.setDeckPreset('20', { presetId: mine.id });
    await study.setDeckPreset('21', { presetId: mine.id });
    renderApp(`/settings/deck-options?preset=${mine.id}`, { study });
    await screen.findByRole('button', { name: 'Editar el nombre' });
    await openAction('Remover configuración');
    const dialog = await screen.findByRole('dialog', { name: '¿Remover Mía?' });
    expect(within(dialog).getByText('La usan 2 mazos, que vuelven a la suya.')).toBeInTheDocument();
  });
});

it('a preset that cannot be created says why, and the one shown stays', async () => {
  const { study, mine } = await withTwo();
  study.savePreset = () => Promise.reject(new Error('sin conexión'));
  renderApp(`/settings/deck-options?preset=${mine.id}`, { study });
  await screen.findByRole('button', { name: 'Editar el nombre' });
  await openAction('Agregar configuración');
  const add = await screen.findByRole('dialog', { name: 'Agregar configuración' });
  await userEvent.type(within(add).getByLabelText('Nombre'), 'Tercera{Enter}');
  expect(await screen.findByText('No se pudo guardar: sin conexión')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Configuración: Mía' })).toBeInTheDocument();
});
