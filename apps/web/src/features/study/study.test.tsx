import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, expect, it } from 'vitest';
import { DECK_PATH, renderApp, fullAnkiStudy } from '../../test/render';
import { cardShadowRoot } from '../decks/CardFrame';
import type { StudyRepository } from './repository';

/** The text of the card's side being shown. */
async function cardText(label: RegExp) {
  const region = await screen.findByRole('region', { name: label });
  await waitFor(() => expect(cardShadowRoot(region)?.querySelector('.card')).toBeTruthy());
  return cardShadowRoot(region)!.querySelector('.card')!.textContent ?? '';
}

/** The three counts at the top (new, learning, to review). */
function counts() {
  const group = screen.getByRole('group', { name: 'Tarjetas que quedan' });
  return [/Nuevas/, /Aprendiendo/, /A repasar/].map((name) =>
    Number(within(group).getByTitle(name.source).textContent!.replace(/\D/g, '')),
  );
}

async function startStudying(study: StudyRepository = fullAnkiStudy()) {
  const r = renderApp(`${DECK_PATH}/study`, { study });
  await cardText(/Frente de la tarjeta/);
  // A deck of a week or lecture: «Volver» still says its course and assessment, and goes to its own page.
  expect(screen.getByRole('link', { name: 'Volver a Anatomía I · Certamen 1' })).toHaveAttribute(
    'href',
    DECK_PATH,
  );
  return { ...r, study };
}

/** Chooses in one of the site's dropdowns. */
async function chooseIn(trigger: HTMLElement, option: string | RegExp) {
  await userEvent.click(trigger);
  await userEvent.click(await screen.findByRole('menuitemradio', { name: option }));
}

/** What the deck has for today, on its page («Para hoy»). */
async function pageLoad() {
  const group = await screen.findByRole('group', { name: 'Para hoy' });
  const button = await within(group).findByRole('button');
  return Number(/(\d+) para hoy/.exec(button.textContent!)?.[1] ?? 0);
}

describe('deck page', () => {
  it('a deck inside a week or lecture has no page of its own, also in «Modo avanzado»', async () => {
    const { router } = renderApp(DECK_PATH);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Certamen 1' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/semesters/1/courses/anatomia-1/anki/certamen-1');
  });

  it('a deck above (the assessment, the course) adds up what is below it, as Anki', async () => {
    const assessment = renderApp('/semesters/1/courses/anatomia-1/anki/certamen-1');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Certamen 1' }),
    ).toBeInTheDocument();
    // The breadcrumbs start at the semester and the course, as the rest of the site.
    const trail = screen.getByRole('navigation', { name: 'Ruta' });
    expect(within(trail).getByRole('link', { name: '1° Semestre' })).toHaveAttribute(
      'href',
      '/semesters/1',
    );
    expect(within(trail).getByRole('link', { name: 'Anatomía I' })).toHaveAttribute(
      'href',
      '/semesters/1/courses/anatomia-1',
    );
    expect(within(trail).queryByText(/Medicina UCH/)).toBeNull();
    await waitFor(async () => expect(await pageLoad()).toBe(3));
    const sub = screen.getByRole('list', { name: 'Submazos' });
    expect(within(sub).getByText('S1 - Semana de prueba')).toBeInTheDocument();
    // No way to the decks of every course.
    expect(screen.queryByRole('link', { name: /Buscar tarjetas|Opciones de Anki/ })).toBeNull();

    assessment.unmount();

    // The course's own deck: its tree, foldable (and remembered).
    const course = renderApp('/semesters/1/courses/anatomia-1/anki');
    const tree = await screen.findByRole('list', { name: 'Submazos' });
    for (const name of ['Certamen 1', 'S1 - Semana de prueba', 'Mazo de prueba']) {
      expect(await within(tree).findByText(name)).toBeInTheDocument();
    }
    await userEvent.click(within(tree).getByRole('button', { name: 'Plegar Certamen 1' }));
    expect(within(tree).queryByText('Mazo de prueba')).toBeNull();
    course.unmount();
    renderApp('/semesters/1/courses/anatomia-1/anki');
    const again = await screen.findByRole('list', { name: 'Submazos' });
    expect(within(again).queryByText('Mazo de prueba')).toBeNull();
    await userEvent.click(within(again).getByRole('button', { name: 'Desplegar Certamen 1' }));
    expect(await within(again).findByText('Mazo de prueba')).toBeInTheDocument();
  });
});

describe('studying', () => {
  it('front, «Mostrar respuesta», the four buttons with their intervals, and the next card', async () => {
    const { study } = await startStudying();
    expect(await cardText(/Frente/)).toContain('¿Cuántas vértebras cervicales hay?');
    expect(counts()).toEqual([3, 0, 0]);
    // The current card's count is underlined, as in Anki.
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

    // Undo, three times: the flag, the suspension, the bury.
    for (let i = 0; i < 3; i++) fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    await waitFor(() => expect(counts()).toEqual([3, 0, 0]));
    expect(await cardText(/Frente/)).toContain('¿Cuántas vértebras');
    await waitFor(async () => expect(await study.cards(['20', '21'])).toEqual([]));
  });

  it('shortcuts by their character (Spanish keyboards), not the browser’s, not on a held key', async () => {
    await startStudying();
    // Ctrl+- is the browser’s zoom: nothing here.
    fireEvent.keyDown(window, { key: '-', ctrlKey: true });
    // A held space repeats: only the first one counts.
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
    // Answering the cloze buried its sibling in Extras (the preset buries new siblings), as Anki says.
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
    // «Volver» says the course and the assessment (with the full text when it is cut).
    const back = screen.getByRole('link', { name: 'Volver a Anatomía I · Certamen 1' });
    expect(back).toHaveAttribute('href', '/semesters/1/courses/anatomia-1/anki/certamen-1');
    expect(back).toHaveAttribute('title', 'Anatomía I · Certamen 1');
    await userEvent.keyboard(' ');
    await cardText(/Reverso/);
    await userEvent.keyboard('4');
    await waitFor(() => expect(counts()).toEqual([2, 0, 0]));
    c1.unmount();
    // The answer counts in every deck above: the course (20 a day, «Default») has 2 left of its 3.
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
    // Coming back is another study session: the answer of the one before stays, undo has nothing to take back.
    await act(async () => {
      fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    });
    expect(await screen.findByText('No hay nada que deshacer')).toBeInTheDocument();
    expect(counts()).toEqual([2, 0, 0]);
    expect(await cardText(/Frente/)).toContain('La columna tiene');
  });
});

describe('Opciones: Anki general y Configuración de mazos', () => {
  it('changing the author’s preset makes the user’s version of it; the deck uses it', async () => {
    const study = fullAnkiStudy();
    // The old link of a deck (`/settings/anki?deck=`) goes to «Configuración de mazos».
    const r = renderApp('/settings/anki?deck=20', { study });
    const limit = await screen.findByLabelText('Tarjetas nuevas/día');
    expect(limit).toHaveValue(20);
    // `?deck=` opens the deck's preset, and the URL says which one.
    await waitFor(() => expect(r.router.state.location.pathname).toBe('/settings/deck-options'));
    await waitFor(() => expect(r.router.state.location.search).toBe('?preset=Default'));
    await userEvent.clear(limit);
    await userEvent.type(limit, '2{Enter}');
    expect(
      screen.getByRole('button', { name: 'Configuración: Default (del autor)' }),
    ).toBeInTheDocument();
    // Which decks use it: the parents too, from the course down (the importer gives them «Default»); the
    // root and the semester are not studied on the web, so they are not listed.
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
    // Back to its own preset: no row.
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

    // The author's cannot be renamed.
    expect(screen.getByRole('button', { name: 'Editar el nombre' })).toBeDisabled();

    await userEvent.click(actions);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Agregar configuración' }));
    let dialog = await screen.findByRole('dialog', { name: 'Agregar configuración' });
    // Without a name, or with one that exists, it says so and stays.
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

    // Renaming: the field under it, turned on by its button.
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

  it('the FSRS parameters shown are the chosen preset’s (and are not copied into another)', async () => {
    const study = fullAnkiStudy();
    renderApp('/settings/deck-options?preset=Default', { study });
    const params = await screen.findByLabelText('Parámetros FSRS');
    const custom = Array.from({ length: 21 }, (_, i) => (i + 1) / 10).join(', ');
    fireEvent.change(params, { target: { value: custom } });
    fireEvent.blur(params);
    await chooseIn(screen.getByRole('button', { name: /^Configuración:/ }), 'Extras (del autor)');
    expect(params).toHaveValue('');
    fireEvent.blur(params);
    await chooseIn(screen.getByRole('button', { name: /^Configuración:/ }), 'Default (del autor)');
    expect(params).toHaveValue(custom);
    // «Restablecer los valores predeterminados de Anki» empties it too.
    await userEvent.click(screen.getByRole('button', { name: 'Acciones de la configuración' }));
    await userEvent.click(
      await screen.findByRole('menuitem', {
        name: 'Restablecer los valores predeterminados de Anki',
      }),
    );
    expect(params).toHaveValue('');
    fireEvent.blur(params);
    await userEvent.click(screen.getAllByRole('button', { name: 'Guardar' })[0]!);
    await screen.findByText('Guardado');
    expect(await study.presets()).toEqual([
      expect.objectContaining({
        replaces: 'Default',
        config: expect.objectContaining({ fsrsParams: [] }),
      }),
    ]);
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

  it('«Opciones» of the user menu opens its page, with its sections on the side', async () => {
    const { router } = renderApp('/home');
    await userEvent.click(await screen.findByRole('button', { name: 'Tu cuenta' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Opciones/ }));
    // No submenu: the page, on its first section.
    expect(screen.queryByRole('menuitem', { name: /Anki/ })).toBeNull();
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings/account'));
    const nav = await screen.findByRole('navigation', { name: 'Secciones de las opciones' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => [l.textContent?.trim(), l.getAttribute('href')])).toEqual([
      ['Datos de usuario', '/settings/account'],
      // Step 2.6
      ['Mis reportes', '/settings/reports'],
      ['General', '/settings/anki'],
      ['Configuración de mazos', '/settings/deck-options'],
    ]);
    // Grouped under titles that are not links: «Cuenta» and «Anki».
    expect(
      within(nav)
        .getAllByRole('group')
        .map((g) => g.getAttribute('aria-labelledby')),
    ).toHaveLength(2);
    expect(within(nav).getByRole('group', { name: 'Anki' })).toContainElement(links[2]!);
    expect(within(nav).getByRole('group', { name: 'Cuenta' })).toContainElement(links[0]!);
    expect(within(nav).getByRole('group', { name: 'Cuenta' })).toContainElement(links[1]!);
    expect(within(nav).queryByRole('link', { name: 'Anki' })).toBeNull();
    expect(links[0]).toHaveAttribute('aria-current', 'page');
    await userEvent.click(links[2]!);
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings/anki'));
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Anki general' }),
    ).toBeInTheDocument();
    const after = screen.getByRole('navigation', { name: 'Secciones de las opciones' });
    expect(within(after).getByRole('link', { name: 'General' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('«Datos de usuario»: name, email, photo, dates of the account and «Cerrar sesión»', async () => {
    const { router } = renderApp('/settings');
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Datos de usuario' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/settings/account');
    const account = screen.getByRole('region', { name: 'Tu cuenta' });
    expect(within(account).getByRole('img', { name: 'Sin foto' })).toHaveTextContent('AP');
    expect(within(account).getAllByText('Ana Pérez').length).toBeGreaterThan(0);
    expect(within(account).getAllByText('ana@ug.uchile.cl').length).toBeGreaterThan(0);
    // Chile time.
    expect(within(account).getByText('31 de octubre de 2026 a las 10:00')).toBeInTheDocument();
    expect(within(account).getByText('1 de noviembre de 2026 a las 09:30')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(await screen.findAllByRole('button', { name: /Entrar con Google/ })).not.toHaveLength(0);
  });
});
