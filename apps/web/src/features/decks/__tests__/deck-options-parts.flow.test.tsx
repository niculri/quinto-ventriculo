// Tests what «Configuración de mazos» and «Anki general» say, section by section, their less used paths, and that
// «Guardar» calls the repository in the click itself.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '@qv/srs';
import { fullAnkiStudy, renderApp } from '../../../test/render';

const sectionTexts = () =>
  within(screen.getByRole('main'))
    .getAllByRole('region')
    .map((r) => [r.getAttribute('aria-label'), r.textContent]);

async function optionsOf(trigger: HTMLElement) {
  await userEvent.click(trigger);
  const names = (await screen.findAllByRole('menuitemradio')).map((o) => o.textContent);
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('menuitemradio')).toBeNull());
  return names;
}

async function openAction(name: string) {
  await userEvent.click(screen.getByRole('button', { name: 'Acciones de la configuración' }));
  await userEvent.click(await screen.findByRole('menuitem', { name }));
}

describe('«Configuración de mazos», what it says', () => {
  it('the intro, the note on sharing, the author’s name and every section with its rows', async () => {
    renderApp('/settings/deck-options?preset=Default');
    const heading = await screen.findByRole('heading', {
      level: 2,
      name: 'Configuración de mazos',
    });
    const intro = heading.nextElementSibling as HTMLElement;
    expect(intro.textContent).toBe(
      'Cada configuración agrupa las opciones de un tipo de mazo, como en Anki. Lo que vale para todos los mazos está en Anki general.',
    );
    expect(within(intro).getByRole('link', { name: 'Anki general' })).toHaveAttribute(
      'href',
      '/settings/anki',
    );
    expect(screen.getByText(/^Una configuración se comparte/).textContent).toBe(
      'Una configuración se comparte: cambiarla cambia todos los mazos que la usan, como en Anki. Qué configuración usa cada mazo se elige con el botón de configuración de ese mazo.',
    );
    expect(screen.getByLabelText('Nombre')).toHaveValue('Default');
    expect(screen.getByRole('button', { name: 'Editar el nombre' })).toHaveAttribute(
      'title',
      'Las configuraciones del autor no se renombran',
    );
    expect(
      screen.getByText('Las del autor no se renombran; clónala para tener una con otro nombre.'),
    ).toBeInTheDocument();
    expect(sectionTexts()).toMatchSnapshot();
  });

  it('the lists say what Anki says, in its order', async () => {
    renderApp('/settings/deck-options?preset=Default');
    const lists = [
      /^Configuración: /,
      /^Acción para olvidadas: /,
      /^Nuevo orden de recolección de tarjetas: /,
      /^Nuevo orden de clasificación de tarjetas: /,
      /^Nuevos\/revisiones \(orden de estudio\): /,
      /^Aprendizaje entre días\/revisiones \(orden de estudio\): /,
      /^Revisar orden de clasificación: /,
    ];
    await screen.findByLabelText('Tarjetas nuevas/día');
    const out: Record<string, (string | null)[]> = {};
    for (const name of lists) {
      const trigger = screen.getByRole('button', { name });
      out[trigger.getAttribute('aria-label')!] = await optionsOf(trigger);
    }
    expect(out).toMatchSnapshot();
  });

  it('warns about too few reviews for the new cards, steps of a day or more and a short maximum interval', async () => {
    renderApp('/settings/deck-options?preset=Default');
    const reviews = await screen.findByLabelText('Repasos máximos/día');
    await userEvent.clear(reviews);
    await userEvent.type(reviews, '50{Enter}');
    const notes = () => screen.getAllByRole('note').map((n) => n.textContent);
    expect(notes()).toEqual([
      'Agregando 20 nuevas tarjetas cada día, su límite de revisión debe ser por lo menos 200.',
    ]);
    const relearn = screen.getByLabelText('Pasos de reaprendizaje');
    await userEvent.clear(relearn);
    await userEvent.type(relearn, '1d{Enter}');
    const interval = screen.getByLabelText('Intervalo máximo');
    await userEvent.clear(interval);
    await userEvent.type(interval, '100{Enter}');
    expect(notes()).toEqual([
      'Agregando 20 nuevas tarjetas cada día, su límite de revisión debe ser por lo menos 200.',
      'Cuando el FSRS está activado, no se recomiendan pasos de 1 día o más.',
      'Un intervalo máximo de menos de 6 meses no es recomendable.',
    ]);
    expect(screen.getAllByRole('status')[0]!.textContent).toBe(' Sin guardar');
  });

  it('cloning starts from «Copia de …»; a changed author’s preset says so and can go back to the author’s', async () => {
    const study = fullAnkiStudy();
    const first = renderApp('/settings/deck-options?preset=Default', { study });
    await screen.findByLabelText('Tarjetas nuevas/día');
    await openAction('Clonar configuración');
    const dialog = await screen.findByRole('dialog', { name: 'Clonar configuración' });
    expect(within(dialog).getByLabelText('Nombre')).toHaveValue('Copia de Default');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    first.unmount();

    await study.savePreset({
      name: 'Default',
      replaces: 'Default',
      config: { ...defaultConfig() },
    });
    const r = renderApp('/settings/deck-options?preset=Default', { study });
    expect(
      await r.findByRole('button', { name: 'Configuración: Default (del autor, cambiada)' }),
    ).toBeInTheDocument();
    await userEvent.click(r.getByRole('button', { name: 'Acciones de la configuración' }));
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Volver a la configuración del autor' }),
    );
    await waitFor(async () => expect(await study.presets()).toEqual([]));
    expect(
      await r.findByRole('button', { name: 'Configuración: Default (del autor)' }),
    ).toBeInTheDocument();
  });

  it('a preset no deck uses says so; removing a used one says how many decks go back', async () => {
    const study = fullAnkiStudy();
    const own = await study.savePreset({
      name: 'Propia',
      replaces: null,
      config: { ...defaultConfig() },
    });
    await study.setDeckPreset('20', { presetId: own.id });
    const fresh = await study.savePreset({
      name: 'Vacía',
      replaces: null,
      config: { ...defaultConfig() },
    });
    renderApp(`/settings/deck-options?preset=${fresh.id}`, { study });
    const using = await screen.findByRole('region', { name: 'Mazos que la usan' });
    expect(using.textContent).toBe('Ningún mazo la usa');
    await openAction('Remover configuración');
    let dialog = await screen.findByRole('dialog', { name: '¿Remover Vacía?' });
    expect(within(dialog).getByText('Ningún mazo la usa.')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    await userEvent.click(screen.getByRole('button', { name: 'Configuración: Vacía' }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Propia' }));
    expect(
      within(screen.getByRole('region', { name: 'Mazos que la usan' })).getByRole('heading')
        .textContent,
    ).toBe('La usan 1 mazo');
    await openAction('Remover configuración');
    dialog = await screen.findByRole('dialog', { name: '¿Remover Propia?' });
    expect(within(dialog).getByText('La usa 1 mazo, que vuelve a la suya.')).toBeInTheDocument();
  });

  it('a save that fails says why, and what was changed stays unsaved', async () => {
    const study = fullAnkiStudy();
    study.savePreset = () => Promise.reject(new Error('sin conexión'));
    renderApp('/settings/deck-options?preset=Default', { study });
    const perDay = await screen.findByLabelText('Tarjetas nuevas/día');
    await userEvent.clear(perDay);
    await userEvent.type(perDay, '30{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('No se pudo guardar: sin conexión')).toHaveAttribute(
      'role',
      'alert',
    );
    expect(screen.getAllByRole('status')[0]!.textContent).toBe(' Sin guardar');
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled();
  });
});

describe('«Anki general», what it says', () => {
  it('while it loads it says so; then where the options of each deck are, and the time zone', async () => {
    renderApp('/settings/anki');
    expect(await screen.findByText('Cargando las opciones…')).toBeInTheDocument();
    const heading = await screen.findByRole('heading', { level: 2, name: 'Anki general' });
    const intro = heading.closest('div')!.nextElementSibling as HTMLElement;
    expect(intro.textContent).toBe(
      'Valen para todos los mazos. Lo de cada tipo de mazo está en Configuración de mazos.',
    );
    expect(within(intro).getByRole('link', { name: 'Configuración de mazos' })).toHaveAttribute(
      'href',
      '/settings/deck-options',
    );
    // The zone is the machine's: the snapshot keeps a placeholder, so that it holds anywhere.
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(
      sectionTexts().map(([label, text]) => [label, text?.replace(zone, '<zone>')]),
    ).toMatchSnapshot();
  });

  it('a change says it is not saved, and after saving, that it is', async () => {
    const study = fullAnkiStudy();
    renderApp('/settings/anki', { study });
    const status = () => screen.getAllByRole('status')[0]!.textContent;
    await screen.findByRole('heading', { level: 2, name: 'Anki general' });
    expect(status()).toBe('');
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
    await userEvent.click(screen.getByRole('switch', { name: 'Mostrar los 4 botones' }));
    expect(status()).toBe(' Sin guardar');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(status()).toBe(' Guardado'));
  });
});

describe('«Guardar» of the Anki options', () => {
  const saveDisabled = () =>
    screen.getByRole('button', { name: 'Guardar' }).hasAttribute('disabled');

  it('«Anki general» saves the preferences in the same click, before the page shows it is saving', async () => {
    const study = fullAnkiStudy();
    const save = study.savePreferences.bind(study);
    const disabledAtCall: boolean[] = [];
    study.savePreferences = (p) => {
      disabledAtCall.push(saveDisabled());
      return save(p);
    };
    renderApp('/settings/anki', { study });
    await screen.findByRole('heading', { level: 2, name: 'Anki general' });
    await userEvent.click(screen.getByRole('switch', { name: 'Mostrar los 4 botones' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(disabledAtCall).toEqual([false]));
  });

  it('«Configuración de mazos» saves the preset in the same click, before the page shows it is saving', async () => {
    const study = fullAnkiStudy();
    const save = study.savePreset.bind(study);
    const disabledAtCall: boolean[] = [];
    study.savePreset = (p) => {
      disabledAtCall.push(saveDisabled());
      return save(p);
    };
    renderApp('/settings/deck-options?preset=Default', { study });
    const perDay = await screen.findByLabelText('Tarjetas nuevas/día');
    await userEvent.clear(perDay);
    await userEvent.type(perDay, '30{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(disabledAtCall).toEqual([false]));
  });
});
