// Tests «Anki general» and «Configuración de mazos»: presets of the author and the user, a deck's preset, and the
// preferences of every deck.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, expect, it } from 'vitest';
import { fullAnkiStudy } from '../../../test/fakes/repositories';
import { DECK_PATH } from '../../../test/fixtures/deck';
import { renderApp } from '../../../test/render';
import { DEFAULT_PARAMETERS, defaultConfig } from '@qv/srs';
import { pageLoad } from '../../../test/dom';
import { chooseIn } from '../../../test/dom';

describe('Opciones: Anki general y Configuración de mazos', () => {
  it('changing the author’s preset makes the user’s version of it; the deck uses it', async () => {
    const study = fullAnkiStudy();
    const r = renderApp('/settings/anki?deck=20', { study });
    const limit = await screen.findByLabelText('Tarjetas nuevas/día');
    expect(limit).toHaveValue(20);
    await waitFor(() => expect(r.router.state.location.pathname).toBe('/settings/deck-options'));
    await waitFor(() => expect(r.router.state.location.search).toBe('?preset=Default'));
    await userEvent.clear(limit);
    await userEvent.type(limit, '2{Enter}');
    expect(
      screen.getByRole('button', { name: 'Configuración: Default (del autor)' }),
    ).toBeInTheDocument();
    const using = screen.getByRole('region', { name: 'Mazos que la usan' });
    expect(within(using).getByText('La usan 4 mazos')).toBeInTheDocument();
    expect(within(using).queryByText(/^1° Semestre$/)).toBeNull();
    await userEvent.click(screen.getAllByRole('button', { name: 'Guardar' })[0]!);
    expect(await screen.findByText('Guardado')).toBeInTheDocument();
    expect(await study.presets()).toEqual([
      expect.objectContaining({ name: 'Default', replaces: 'Default' }),
    ]);
    r.unmount();
    renderApp(DECK_PATH, { study });
    await waitFor(async () => expect(await pageLoad()).toBe(2));
  });

  it('a deck can use another preset (the author’s «Extras»: 0 new a day) from the list', async () => {
    const study = fullAnkiStudy();
    renderApp('/semesters/1/courses/anatomia-1/anki/certamen-1', { study });
    const open = await screen.findByRole('button', { name: 'Configuración de Mazo de prueba' });
    await userEvent.click(open);
    const dialog = await screen.findByRole('dialog');
    await chooseIn(
      await within(dialog).findByRole('button', { name: /^Configuración de este mazo:/ }),
      'Extras (del autor)',
    );
    await waitFor(async () =>
      expect(await study.deckSettings()).toEqual([
        { deckId: '20', presetId: null, authorPreset: 'Extras' },
      ]),
    );
    expect(
      within(dialog).getByRole('link', { name: 'Editar o crear configuraciones' }),
    ).toHaveAttribute('href', '/settings/deck-options?preset=Extras');
    await chooseIn(
      within(dialog).getByRole('button', { name: /^Configuración de este mazo:/ }),
      'Default (del autor)',
    );
    await waitFor(async () => expect(await study.deckSettings()).toEqual([]));
  });

  it('a configuration is named, renamed and removed inside the site, without the browser’s boxes', async () => {
    const prompt = vi.spyOn(window, 'prompt');
    const confirm = vi.spyOn(window, 'confirm');
    const study = fullAnkiStudy();
    renderApp('/settings/deck-options', { study });
    const actions = await screen.findByRole('button', { name: 'Acciones de la configuración' });

    expect(screen.getByRole('button', { name: 'Editar el nombre' })).toBeDisabled();

    await userEvent.click(actions);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Agregar configuración' }));
    let dialog = await screen.findByRole('dialog', { name: 'Agregar configuración' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Ponle un nombre.');
    const name = within(dialog).getByLabelText('Nombre');
    await userEvent.type(name, 'Default');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Ya hay una configuración');
    await userEvent.clear(name);
    await userEvent.type(name, 'Para el certamen{Enter}');
    expect(
      await screen.findByRole('button', { name: 'Configuración: Para el certamen' }),
    ).toBeInTheDocument();

    const field = await screen.findByDisplayValue('Para el certamen');
    expect(field).toHaveAttribute('readonly');
    await userEvent.click(screen.getByRole('button', { name: 'Editar el nombre' }));
    const editing = await screen.findByDisplayValue('Para el certamen');
    expect(editing).not.toHaveAttribute('readonly');
    await userEvent.clear(editing);
    await userEvent.type(editing, 'Otro nombre{Enter}');
    expect(
      await screen.findByRole('button', { name: 'Configuración: Otro nombre' }),
    ).toBeInTheDocument();
    expect((await study.presets()).map((p) => p.name)).toEqual(['Otro nombre']);

    await userEvent.click(screen.getByRole('button', { name: 'Acciones de la configuración' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remover configuración' }));
    dialog = await screen.findByRole('dialog', { name: '¿Remover Otro nombre?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remover' }));
    await waitFor(async () => expect(await study.presets()).toEqual([]));

    expect(prompt).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('«Anki general» has only the preferences of every deck, and saves them', async () => {
    const study = fullAnkiStudy();
    renderApp('/settings/anki', { study });
    const hour = await screen.findByLabelText('El siguiente día empieza a las');
    expect(screen.queryByRole('button', { name: /^Configuración:/ })).toBeNull();
    expect(screen.queryByLabelText('Tarjetas nuevas/día')).toBeNull();
    await userEvent.clear(hour);
    await userEvent.type(hour, '5{Enter}');
    await userEvent.click(screen.getByRole('switch', { name: 'Límites empiezan desde arriba' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Guardar' })[0]!);
    await screen.findByText('Guardado');
    expect(await study.preferences()).toMatchObject({ dayStartsAt: 5, applyAllParentLimits: true });
  });

  it('the FSRS parameters are read-only: the preset’s own, or the defaults in grey', async () => {
    const study = fullAnkiStudy();
    const custom = Array.from({ length: 21 }, (_, i) => (i + 1) / 10);
    await study.savePreset({
      name: 'Default',
      replaces: 'Default',
      config: { ...defaultConfig(), fsrsParams: custom, historicalRetention: 0.8 },
    });
    renderApp('/settings/deck-options?preset=Default', { study });
    const group = await screen.findByRole('group', { name: 'Parámetros FSRS' });
    expect(within(group).getByLabelText('Parámetros de esta configuración')).toHaveTextContent(
      custom.join(', '),
    );
    expect(within(group).queryByRole('textbox')).toBeNull();
    expect(within(group).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Optimizar' })).toBeNull();
    expect(screen.queryByText('Retención histórica')).toBeNull();
    expect(within(group).getByText(/no deja cambiarlos/)).toBeInTheDocument();
    await chooseIn(screen.getByRole('button', { name: /^Configuración:/ }), 'Extras (del autor)');
    const defaults = within(group).getByLabelText('Parámetros predeterminados');
    expect(defaults).toHaveTextContent(DEFAULT_PARAMETERS.join(', '));
    expect(defaults).toHaveClass('text-muted');
  });

  it('a preset with «Retención histórica» or its own parameters keeps them on saving; resetting clears them', async () => {
    const study = fullAnkiStudy();
    const custom = Array.from({ length: 21 }, (_, i) => (i + 1) / 10);
    await study.savePreset({
      name: 'Default',
      replaces: 'Default',
      config: { ...defaultConfig(), fsrsParams: custom, historicalRetention: 0.8 },
    });
    renderApp('/settings/deck-options?preset=Default', { study });
    const perDay = await screen.findByLabelText('Tarjetas nuevas/día');
    await userEvent.clear(perDay);
    await userEvent.type(perDay, '35{Enter}');
    await userEvent.click(screen.getAllByRole('button', { name: 'Guardar' })[0]!);
    await screen.findByText('Guardado');
    expect((await study.presets())[0]!.config).toMatchObject({
      newPerDay: 35,
      fsrsParams: custom,
      historicalRetention: 0.8,
    });
    await userEvent.click(screen.getByRole('button', { name: 'Acciones de la configuración' }));
    await userEvent.click(
      await screen.findByRole('menuitem', {
        name: 'Restablecer los valores predeterminados de Anki',
      }),
    );
    expect(perDay).toHaveValue(20);
    await userEvent.click(screen.getAllByRole('button', { name: 'Guardar' })[0]!);
    await screen.findByText('Guardado');
    expect((await study.presets())[0]!.config).toMatchObject({
      newPerDay: 20,
      fsrsParams: defaultConfig().fsrsParams,
      historicalRetention: defaultConfig().historicalRetention,
    });
  });

  it('values out of range go to the nearest valid one; steps are written as in Anki', async () => {
    renderApp('/settings/deck-options');
    expect(screen.queryByLabelText('El siguiente día empieza a las')).toBeNull();
    const retention = await screen.findByLabelText('Retención deseada');
    await userEvent.clear(retention);
    await userEvent.type(retention, '1.5{Enter}');
    expect(retention).toHaveValue(0.99);
    const steps = screen.getByLabelText('Pasos en la etapa de aprendizaje');
    expect(steps).toHaveValue('1m 10m');
    await userEvent.clear(steps);
    await userEvent.type(steps, '30s 2h 1d{Enter}');
    expect(steps).toHaveValue('30s 2h 1d');
    expect(
      screen.getByText('Cuando el FSRS está activado, no se recomiendan pasos de 1 día o más.'),
    ).toBeInTheDocument();
  });
});
