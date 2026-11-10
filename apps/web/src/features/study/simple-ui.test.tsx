import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Catalog } from '@qv/schema';
import { CATALOG, DECK_PATH, fakeApi, fullAnkiStudy, renderApp } from '../../test/render';
import { cardShadowRoot } from '../decks/CardFrame';
import { localStudyRepository } from './repository';
import type { StudyRepository } from './repository';

/** A student who just arrived, with the deck's week turned on and the welcome already closed. */
function student(over: { welcomeSeen?: boolean; fourButtons?: boolean } = {}): StudyRepository {
  return localStudyRepository(null, { welcomeSeen: true, ...over });
}

const WEEK_ID = '5';
const ASSESSMENT_PATH = '/semesters/1/courses/anatomia-1/anki/certamen-1';
const COURSE_PATH = '/semesters/1/courses/anatomia-1';

async function withWeekOn(study = student()) {
  await study.setDeckActivation(WEEK_ID, true);
  return study;
}

async function cardText(label: RegExp) {
  const region = await screen.findByRole('region', { name: label });
  await waitFor(() => expect(cardShadowRoot(region)?.querySelector('.card')).toBeTruthy());
  return cardShadowRoot(region)!.querySelector('.card')!.textContent ?? '';
}

describe('a student who just arrived', () => {
  it('studying with nothing turned on, the screen says what to do and links to it', async () => {
    renderApp(`${DECK_PATH}/study`, { study: student() });
    expect(
      await screen.findByRole('heading', { name: 'Todavía no activas esta materia' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Elegir qué estudiar' })).toHaveAttribute(
      'href',
      DECK_PATH,
    );
  });

  it('the welcome shows once: closing it is remembered', async () => {
    const study = localStudyRepository(null);
    await study.setDeckActivation(WEEK_ID, true);
    const first = renderApp(`${DECK_PATH}/study`, { study });
    const dialog = await screen.findByRole('dialog', { name: 'Cómo se estudia aquí' });
    expect(within(dialog).getByText(/Intenta acordarte/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Entendido' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(async () => expect((await study.preferences())?.welcomeSeen).toBe(true));
    first.unmount();
    renderApp(`${DECK_PATH}/study`, { study });
    await cardText(/Frente de la tarjeta/);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the deck page says the load in minutes, with its breakdown on opening it, and no preset', async () => {
    renderApp(ASSESSMENT_PATH, { study: await withWeekOn() });
    const panel = await screen.findByRole('region', { name: 'Estudiar' });
    const load = (await within(panel).findAllByRole('button', { name: /para hoy · ~\d+ min/ }))[0]!;
    const today = within(panel).getAllByRole('group', { name: 'Para hoy' })[0]!;
    expect(load).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(load);
    expect(load).toHaveAttribute('aria-expanded', 'true');
    expect(within(today).getByText('Nuevas')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Opciones de este mazo' })).toBeNull();
    // Weeks and lectures are chosen with their switches: the site's menu does not go to them.
    const menu = screen.getByRole('navigation', { name: 'Menú del sitio' });
    expect(within(menu).getByRole('link', { name: 'Anki' })).toBeInTheDocument();
    expect(within(menu).queryByRole('link', { name: 'Todo el certamen' })).toBeNull();
    expect(within(menu).queryByRole('link', { name: 'S1 - Semana de prueba' })).toBeNull();
    // Its Extras is not listed as a deck.
    expect(screen.queryByText('Extras')).toBeNull();
  });

  it('a week is turned on from the assessment’s page: the counts follow, and it is saved', async () => {
    const study = student();
    renderApp('/semesters/1/courses/anatomia-1/anki/certamen-1', { study });
    const toggle = await screen.findByRole('switch', { name: 'Activar S1 - Semana de prueba' });
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
    await waitFor(async () =>
      expect(await study.deckActivations()).toEqual([{ deckId: WEEK_ID, active: true }]),
    );
    expect(
      await within(screen.getByRole('group', { name: 'Para hoy' })).findByRole('button', {
        name: /para hoy/,
      }),
    ).toBeInTheDocument();
  });

  it('the page of an assessment has its new cards a day and «Incluir extras»', async () => {
    const study = await withWeekOn();
    renderApp('/semesters/1/courses/anatomia-1/anki/certamen-1', { study });
    const options = await screen.findByRole('region', { name: 'Opciones de Certamen 1' });
    const number = within(options).getByRole('spinbutton', { name: 'Tarjetas nuevas por día' });
    await waitFor(() => expect(number).toHaveValue(20));
    await userEvent.clear(number);
    await userEvent.type(number, '35{Enter}');
    await waitFor(async () =>
      expect((await study.assessmentSettings())[0]).toMatchObject({ newPerDay: 35 }),
    );
    expect(screen.queryByText('Extras')).toBeNull();
    await userEvent.click(within(options).getByRole('switch', { name: 'Incluir extras' }));
    await waitFor(async () =>
      expect((await study.assessmentSettings())[0]).toMatchObject({
        includeExtras: true,
        newPerDay: 35,
      }),
    );
    // With it on, the Extras is one more deck of the list.
    expect(await screen.findAllByText('Extras')).not.toHaveLength(0);
  });

  it('an assessment without Extras does not offer to include them', async () => {
    const catalog = structuredClone(CATALOG);
    catalog.anki.decks = catalog.anki.decks.filter((d) => !d.name.endsWith('::Extras'));
    renderApp(ASSESSMENT_PATH, {
      study: student(),
      api: fakeApi({ catalog: async () => catalog }),
    });
    const options = await screen.findByRole('region', { name: 'Opciones de Certamen 1' });
    expect(
      within(options).getByRole('spinbutton', { name: 'Tarjetas nuevas por día' }),
    ).toBeInTheDocument();
    expect(within(options).queryByRole('switch', { name: 'Incluir extras' })).toBeNull();
    expect(within(options).queryByText('Incluir extras')).toBeNull();
  });

  it('«Quien ya estudió no pierde nada»: what they answered counts as on, until they turn it off', async () => {
    const study = student();
    // An answer of the deck, before this version existed.
    await study.recordReview({
      card: { noteGuid: 's@/AqX%n?#', ord: 0, deckId: '20' },
      expectedUpdatedAt: null,
      rating: 3,
      queueBefore: 'new',
      interval: -600,
      lastInterval: 0,
      durationMs: 3000,
      state: {
        phase: 'learning',
        interday: false,
        remainingSteps: 1,
        due: new Date(Date.now() + 600_000).toISOString(),
        interval: 0,
        stability: 2,
        difficulty: 5,
        reps: 1,
        lapses: 0,
        lastReview: new Date().toISOString(),
        suspended: false,
        leech: false,
      },
      bury: [],
      buriedUntil: null,
    });
    renderApp(DECK_PATH, { study });
    const toggle = await screen.findByRole('switch', { name: 'Activar S1 - Semana de prueba' });
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);
    await waitFor(async () =>
      expect(await study.deckActivations()).toEqual([{ deckId: WEEK_ID, active: false }]),
    );
    await waitFor(() => expect(toggle).not.toBeChecked());
  });
});

describe('the study screen in simple mode', () => {
  async function studying(study: StudyRepository) {
    renderApp(`${DECK_PATH}/study`, { study });
    await cardText(/Frente de la tarjeta/);
    return study;
  }
  const answers = () => within(screen.getByRole('group', { name: 'Responder' }));

  it('two buttons: 1 is «Otra vez» and 2, space or Enter is «Bien» (the rating of FSRS is 3)', async () => {
    const study = await studying(await withWeekOn());
    const first = await cardText(/Frente de la tarjeta/);
    fireEvent.keyDown(window, { key: ' ' });
    await cardText(/Reverso de la tarjeta/);
    expect(
      answers()
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Otra vez (<1 m)', 'Bien (<10 m)']);
    // The keys of the other two buttons do nothing.
    fireEvent.keyDown(window, { key: '3' });
    fireEvent.keyDown(window, { key: '4' });
    expect(await study.answersSince(new Date(0))).toHaveLength(0);
    expect(screen.getByRole('region', { name: /Reverso de la tarjeta/ })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: '2' });
    await waitFor(async () =>
      expect(await study.ratedSince(new Date(0))).toEqual([expect.objectContaining({ rating: 3 })]),
    );
    expect(await cardText(/Frente de la tarjeta/)).not.toBe(first);
    fireEvent.keyDown(window, { key: ' ' });
    await cardText(/Reverso de la tarjeta/);
    fireEvent.keyDown(window, { key: '1' });
    await waitFor(async () =>
      expect((await study.ratedSince(new Date(0))).map((a) => a.rating)).toEqual([3, 1]),
    );
  });

  it('«Mostrar los 4 botones» brings them back without the full mode', async () => {
    await studying(await withWeekOn(student({ fourButtons: true })));
    fireEvent.keyDown(window, { key: ' ' });
    await cardText(/Reverso de la tarjeta/);
    expect(answers().getAllByRole('button')).toHaveLength(4);
  });

  it('«Saltar por hoy» buries the note, «No mostrar más» suspends the card, and undo is a button', async () => {
    const study = await studying(await withWeekOn());
    // No Anki's menu here.
    await userEvent.click(screen.getByRole('button', { name: 'Más' }));
    let menu = await screen.findByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: /Enterrar/ })).toBeNull();
    expect(within(menu).queryByRole('menuitem', { name: /Suspender/ })).toBeNull();
    await userEvent.click(within(menu).getByRole('menuitem', { name: /Saltar por hoy/ }));
    expect(await screen.findByText('Saltada por hoy.')).toBeInTheDocument();
    await waitFor(async () =>
      expect((await study.allCards()).every((c) => c.buriedUntil !== null)).toBe(true),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(await screen.findByText('Deshecho: Saltar por hoy')).toBeInTheDocument();
    await waitFor(async () => expect(await study.allCards()).toEqual([]));

    await userEvent.click(screen.getByRole('button', { name: 'Más' }));
    menu = await screen.findByRole('menu');
    await userEvent.click(within(menu).getByRole('menuitem', { name: /No mostrar más/ }));
    await waitFor(async () =>
      expect(await study.allCards()).toEqual([expect.objectContaining({ suspended: true })]),
    );
  });

  it('one flag, «Marcar para revisar», that goes on and off', async () => {
    const study = await studying(await withWeekOn());
    await userEvent.click(screen.getByRole('button', { name: 'Más' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Marcar para revisar' }));
    expect(await screen.findByLabelText('Marcada para revisar')).toBeInTheDocument();
    await waitFor(async () => expect((await study.allCards())[0]?.flag).toBe(1));
    await userEvent.click(screen.getByRole('button', { name: 'Más' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Quitar la marca' }));
    await waitFor(async () => expect((await study.allCards())[0]?.flag).toBe(0));
  });

  it('with a big load, it warns once and offers to stop', async () => {
    const study = await withWeekOn();
    // Slow answers: the 3 new cards of the test deck take more than 45 minutes.
    study.medianAnswerMs = async () => 500_000;
    await studying(study);
    const notice = await screen.findByRole('status', { name: '' });
    expect(notice).toHaveTextContent(/Hoy son \d+ tarjetas/);
    expect(within(notice).getByRole('link', { name: 'Parar por hoy' })).toHaveAttribute(
      'href',
      DECK_PATH,
    );
    await userEvent.click(within(notice).getByRole('button', { name: 'Seguir' }));
    expect(screen.queryByText(/Hoy son \d+ tarjetas/)).toBeNull();
  });

  it('finished, it says what is next', async () => {
    const study = await withWeekOn();
    renderApp(`${DECK_PATH}/study`, { study });
    await cardText(/Frente de la tarjeta/);
    for (let i = 0; i < 10 && !screen.queryByRole('heading', { name: 'Listo por hoy' }); i++) {
      await act(async () => {
        fireEvent.keyDown(window, { key: '-' });
        await Promise.resolve();
      });
    }
    expect(await screen.findByRole('heading', { name: 'Listo por hoy' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Las tarjetas que saltaste y las de la misma nota que una de hoy salen desde mañana.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Felicitaciones/)).toBeNull();
  });
});

/** The deck never arrives: what a slow connection shows for a while. */
const slowDeck = () => fakeApi({ deck: () => new Promise(() => {}) });

describe('while the data arrives, nothing that will have to change', () => {
  it('the deck page does not show the table of the full Anki, nor the Extras', async () => {
    renderApp(ASSESSMENT_PATH, { study: student(), api: slowDeck() });
    const list = await screen.findByRole('list', { name: 'Submazos' });
    expect(within(list).getByText('S1 - Semana de prueba')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Submazos' })).toBeNull();
    expect(screen.queryByText('Extras')).toBeNull();
    // The switch is already there: it does not depend on the deck.
    expect(await screen.findByRole('switch', { name: /Activar S1/ })).not.toBeChecked();
  });

  it('nor while the preferences load: the switches wait, with their room', async () => {
    const study = student();
    study.preferences = () => new Promise(() => {});
    renderApp(ASSESSMENT_PATH, { study, api: slowDeck() });
    await screen.findByRole('list', { name: 'Submazos' });
    expect(screen.queryByRole('table', { name: 'Submazos' })).toBeNull();
    // The week switches depend on the preferences. «Incluir extras» does not (it is the assessment's setting, with a
    // skeleton of its size meanwhile): asking for no switch at all failed whenever that setting arrived first.
    expect(screen.queryByRole('switch', { name: /Activar/ })).toBeNull();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(screen.queryByRole('switch', { name: /Activar/ })).toBeNull();
  });

  it('in «Modo avanzado», the same list and a button for the configuration of each deck', async () => {
    renderApp(ASSESSMENT_PATH, { study: fullAnkiStudy(), api: slowDeck() });
    expect(await screen.findByRole('switch', { name: /Activar S1/ })).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Submazos' })).toBeNull();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Configuración de S1 - Semana de prueba' }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByRole('button', { name: /^Configuración de este mazo:/ }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('link', { name: 'Editar o crear configuraciones' }),
    ).toHaveAttribute('href', expect.stringContaining('/settings/deck-options'));
  });

  it('the course’s page has what to turn on before the counts arrive', async () => {
    renderApp(COURSE_PATH, { study: student(), api: slowDeck() });
    expect(await screen.findByText(/Qué estás estudiando · 0 de 1/)).toBeInTheDocument();
    expect(await screen.findByRole('switch', { name: /Activar S1/ })).toBeInTheDocument();
  });

  it('the home page does not offer «Estudiar» until it knows there is something to study', async () => {
    const study = await withWeekOn();
    study.homeCounts = () => new Promise(() => {});
    renderApp('/home', { study, api: slowDeck() });
    const today = await screen.findByRole('region', { name: 'Hoy' });
    expect(within(today).getByRole('link', { name: /Anatomía I/ })).toBeInTheDocument();
    expect(within(today).queryByRole('link', { name: /Estudiar/ })).toBeNull();
    expect(within(today).queryByRole('link', { name: 'Elegir qué estudiar' })).toBeNull();
  });

  it('the home page counts without the deck (step 3.2)', async () => {
    let decks = 0;
    const api = fakeApi({
      deck: () => {
        decks++;
        return new Promise(() => {});
      },
    });
    renderApp('/home', { study: await withWeekOn(), api });
    const today = await screen.findByRole('region', { name: 'Hoy' });
    expect(await within(today).findByRole('link', { name: /Estudiar/ })).toBeInTheDocument();
    expect(within(today).getByRole('button', { name: /para hoy · ~\d+ min/ })).toBeInTheDocument();
    expect(decks).toBe(0);
  });

  it('with nothing on, «Hoy» says so and offers to choose, and the first steps show', async () => {
    renderApp('/home', { study: student() });
    const today = await screen.findByRole('region', { name: 'Hoy' });
    expect(
      within(today).getByText(/Todavía no activas ninguna semana o clase/),
    ).toBeInTheDocument();
    expect(within(today).getByRole('link', { name: 'Elegir qué estudiar' })).toBeInTheDocument();
    const steps = screen.getByRole('region', { name: 'Primeros pasos' });
    expect(within(steps).getByText('Elige tus ramos')).toBeInTheDocument();
    expect(within(steps).getAllByText(/\(pendiente\)/, { selector: 'span' })).toHaveLength(3);
  });
});

describe('when the data does not arrive', () => {
  const failing = () => fakeApi({ deck: () => Promise.reject(new Error('sin conexión')) });

  it('the course’s page says so instead of a skeleton forever', async () => {
    renderApp(COURSE_PATH, { study: student(), api: failing() });
    expect(await screen.findByText('No se pudo cargar.')).toBeInTheDocument();
  });

  it('the home page too', async () => {
    const study = await withWeekOn();
    study.homeCounts = () => Promise.reject(new Error('sin conexión'));
    renderApp('/home', { study, api: failing() });
    const today = await screen.findByRole('region', { name: 'Hoy' });
    expect(await within(today).findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('without the plan, the deck page offers to try again', async () => {
    const study = student();
    study.deckActivations = () => Promise.reject(new Error('No se pudo leer'));
    renderApp(DECK_PATH, { study });
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});

describe('two changes in a row', () => {
  it('saving the first one does not undo the second on the screen', async () => {
    const study = await withWeekOn();
    const save = study.setDeckActivation.bind(study);
    let release = () => {};
    study.setDeckActivation = (id, active) =>
      new Promise<void>((resolve) => {
        release = resolve;
      }).then(() => save(id, active));
    const saveSetting = study.assessmentSettings.bind(study);
    let reads = 0;
    study.assessmentSettings = () => {
      reads++;
      return saveSetting();
    };
    const keep = study.saveAssessmentSetting.bind(study);
    let releaseSecond = () => {};
    study.saveAssessmentSetting = (setting) =>
      new Promise<void>((resolve) => {
        releaseSecond = resolve;
      }).then(() => keep(setting));

    renderApp(ASSESSMENT_PATH, { study });
    const week = await screen.findByRole('switch', { name: /Activar S1/ });
    const extras = await screen.findByRole('switch', { name: 'Incluir extras' });
    await waitFor(() => expect(week).toBeChecked());
    await userEvent.click(week);
    await userEvent.click(extras);
    expect(week).not.toBeChecked();
    expect(extras).toBeChecked();
    const before = reads;
    await act(async () => {
      release();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    // The first one is saved, the second one is still on its way: the plan is not read yet.
    expect(reads).toBe(before);
    expect(extras).toBeChecked();
    await act(async () => {
      releaseSecond();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    await waitFor(() => expect(reads).toBeGreaterThan(before));
    expect(week).not.toBeChecked();
    expect(extras).toBeChecked();
    expect(await study.assessmentSettings()).toEqual([
      { deckId: '4', includeExtras: true, newPerDay: null },
    ]);
  });

  it('a change that fails goes back, and says so', async () => {
    const study = student();
    study.setDeckActivation = () => Promise.reject(new Error('sin conexión'));
    renderApp(DECK_PATH, { study });
    const toggle = await screen.findByRole('switch', { name: /Activar S1/ });
    await userEvent.click(toggle);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar');
    await waitFor(() => expect(toggle).not.toBeChecked());
  });
});

describe('a page with nothing to show still says what to do', () => {
  const EXTRAS_PATH = `${DECK_PATH}/extras`;

  it('a lecture or an Extras has no page of its own: there is nothing more inside them', async () => {
    for (const path of [DECK_PATH, EXTRAS_PATH]) {
      const page = renderApp(path, { study: await withWeekOn() });
      expect(
        await screen.findByRole('region', { name: 'Opciones de Certamen 1' }),
      ).toBeInTheDocument();
      page.unmount();
    }
  });

  it('studying it, the same: not «turn the lecture on», which is on', async () => {
    renderApp(`${EXTRAS_PATH}/study`, { study: await withWeekOn() });
    expect(
      await screen.findByRole('heading', { name: 'Las extras están apagadas' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Todavía no activas/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Ir a Certamen 1' })).toHaveAttribute(
      'href',
      ASSESSMENT_PATH,
    );
  });

  it('a course without decks says it has no material, and its Anki page does not exist', async () => {
    const page = renderApp('/semesters/2/courses/fisica', { study: student() });
    expect(await screen.findByText('Todavía no hay material de este ramo.')).toBeInTheDocument();
    page.unmount();
    renderApp('/semesters/2/courses/fisica/anki', { study: student() });
    // In the breadcrumbs and in the menu, whichever arrives first.
    expect((await screen.findAllByRole('link', { name: /Inicio/ })).length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: /Todavía no activas/ })).toBeNull();
  });

  it('the pages only of the full mode, by URL, take to «Anki general»', async () => {
    for (const url of [
      '/settings/deck-options?preset=Default',
      '/settings/anki?deck=20',
      `${DECK_PATH.replace('/certamen-1/s1-semana-de-prueba/mazo-de-prueba', '/mazo-de-prueba')}/options`,
    ]) {
      const page = renderApp(url, { study: student() });
      expect(await screen.findByRole('heading', { name: 'Anki general' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Configuración de mazos' })).toBeNull();
      page.unmount();
    }
  });

  it('with nothing left in what is on, «Listo por hoy» and more to turn on when there is', async () => {
    const study = await withWeekOn();
    await study.saveAssessmentSetting({ deckId: '4', includeExtras: false, newPerDay: 0 });
    renderApp(`${DECK_PATH}/study`, { study });
    expect(await screen.findByRole('heading', { name: 'Listo por hoy' })).toBeInTheDocument();
    expect(screen.getByText(/subir el número/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver al mazo' })).toHaveAttribute('href', DECK_PATH);
  });
});

describe('the keyboard in the study screen', () => {
  /** The test catalog with an article of the test deck. */
  function withMaterial(): Catalog {
    const copy = structuredClone(CATALOG);
    const assessment = copy.semesters[0]!.courses[0]!.assessments[0]!;
    assessment.notes = [
      {
        ...copy.semesters[1]!.courses[0]!.assessments[0]!.notes[0]!,
        id: 'AP-A1-S1-01',
        slug: 'mazo-de-prueba',
        courseId: 'anatomia-1',
        assessmentId: assessment.id,
        practice: { deck: 'Mazo de prueba' },
      },
    ];
    return copy;
  }

  it('after opening «Ver apunte», Enter answers: it does not open the article again', async () => {
    const study = await withWeekOn();
    renderApp(`${DECK_PATH}/study`, {
      study,
      api: fakeApi({ catalog: async () => withMaterial() }),
    });
    await cardText(/Frente de la tarjeta/);
    fireEvent.keyDown(window, { key: ' ' });
    await cardText(/Reverso de la tarjeta/);
    const link = await screen.findByRole('link', { name: 'Ver apunte' });
    expect(link).toHaveAttribute('target', '_blank');
    link.focus();
    fireEvent.click(link);
    expect(document.activeElement).not.toBe(link);
    fireEvent.keyDown(document.body, { key: 'Enter' });
    await waitFor(async () =>
      expect(await study.ratedSince(new Date(0))).toEqual([expect.objectContaining({ rating: 3 })]),
    );
  });

  it('a tip once (step 3.2): after answering, the next answer says what «Ver apunte» is', async () => {
    window.localStorage.removeItem('qv-tips-shown');
    window.sessionStorage.clear();
    const study = await withWeekOn();
    renderApp(`${DECK_PATH}/study`, {
      study,
      api: fakeApi({ catalog: async () => withMaterial() }),
    });
    await cardText(/Frente de la tarjeta/);
    fireEvent.keyDown(window, { key: ' ' });
    await screen.findByRole('link', { name: 'Ver apunte' });
    // Not before doing it.
    expect(screen.queryByText('lleva al apunte del que sale esta tarjeta')).toBeNull();
    fireEvent.keyDown(document.body, { key: 'Enter' });
    await cardText(/Frente de la tarjeta/);
    fireEvent.keyDown(window, { key: ' ' });
    expect(
      await screen.findByText('lleva al apunte del que sale esta tarjeta'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar el consejo' }));
    // Closed, it keeps its room (hidden) until the visit ends: «Ver apunte» does not move (review of 3.2).
    expect(screen.queryByRole('button', { name: 'Cerrar el consejo' })).toBeNull();
    expect(
      screen.getByText('lleva al apunte del que sale esta tarjeta').closest('[aria-hidden="true"]'),
    ).toHaveClass('invisible');
    await waitFor(async () =>
      expect((await study.preferences())?.dismissed).toContain('tip-material'),
    );
  });

  it('with the welcome open, the keys do nothing behind it; closed, they work', async () => {
    const study = localStudyRepository(null);
    await study.setDeckActivation(WEEK_ID, true);
    renderApp(`${DECK_PATH}/study`, { study });
    const dialog = await screen.findByRole('dialog', { name: 'Cómo se estudia aquí' });
    const close = within(dialog).getByRole('button', { name: 'Entendido' });
    for (const key of [' ', 'Enter', '1', '2', '-', '@']) fireEvent.keyDown(close, { key });
    expect(await study.allCards()).toEqual([]);
    expect(screen.queryByRole('region', { name: /Reverso de la tarjeta/ })).toBeNull();
    await userEvent.click(close);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.keyDown(document.body, { key: ' ' });
    await cardText(/Reverso de la tarjeta/);
  });

  it('writing a report does not skip, hide or answer', async () => {
    const study = await withWeekOn();
    renderApp(`${DECK_PATH}/study`, { study });
    await cardText(/Frente de la tarjeta/);
    fireEvent.keyDown(window, { key: ' ' });
    await cardText(/Reverso de la tarjeta/);
    await userEvent.click(screen.getByRole('button', { name: 'Más' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Reportar error' }));
    const box = await screen.findByLabelText('¿Qué está mal?');
    await userEvent.type(box, '1-2 @ error');
    expect(box).toHaveValue('1-2 @ error');
    expect(await study.allCards()).toEqual([]);
    expect(await study.ratedSince(new Date(0))).toEqual([]);
  });

  it('with the menu open, the keys of the card do nothing', async () => {
    const study = await withWeekOn();
    renderApp(`${DECK_PATH}/study`, { study });
    await cardText(/Frente de la tarjeta/);
    fireEvent.keyDown(window, { key: ' ' });
    await cardText(/Reverso de la tarjeta/);
    await userEvent.click(screen.getByRole('button', { name: 'Más' }));
    const menu = await screen.findByRole('menu');
    for (const key of ['1', '2', '-', '@']) fireEvent.keyDown(menu, { key });
    expect(await study.ratedSince(new Date(0))).toEqual([]);
    expect(await study.allCards()).toEqual([]);
  });

  it('with the 4 buttons, the four keys, and space is still «Bien»', async () => {
    const study = await withWeekOn(student({ fourButtons: true }));
    renderApp(`${DECK_PATH}/study`, { study });
    for (const key of ['4', ' ']) {
      await cardText(/Frente de la tarjeta/);
      fireEvent.keyDown(window, { key: ' ' });
      await cardText(/Reverso de la tarjeta/);
      fireEvent.keyDown(window, { key });
    }
    await waitFor(async () =>
      expect((await study.ratedSince(new Date(0))).map((a) => a.rating)).toEqual([4, 3]),
    );
  });

  it('before showing the answer, 1 and 2 do not answer', async () => {
    const study = await withWeekOn();
    renderApp(`${DECK_PATH}/study`, { study });
    await cardText(/Frente de la tarjeta/);
    fireEvent.keyDown(window, { key: '1' });
    fireEvent.keyDown(window, { key: '2' });
    expect(await study.ratedSince(new Date(0))).toEqual([]);
    expect(screen.getByRole('button', { name: 'Mostrar respuesta' })).toBeInTheDocument();
  });

  it('a key held down answers only once', async () => {
    const study = await withWeekOn();
    renderApp(`${DECK_PATH}/study`, { study });
    await cardText(/Frente de la tarjeta/);
    fireEvent.keyDown(window, { key: ' ' });
    await cardText(/Reverso de la tarjeta/);
    fireEvent.keyDown(window, { key: '2' });
    fireEvent.keyDown(window, { key: '2', repeat: true });
    fireEvent.keyDown(window, { key: ' ', repeat: true });
    await cardText(/Frente de la tarjeta/);
    await waitFor(async () => expect(await study.ratedSince(new Date(0))).toHaveLength(1));
    expect(screen.queryByRole('region', { name: /Reverso de la tarjeta/ })).toBeNull();
  });
});

describe('«Opciones» in simple mode', () => {
  it('«Anki general»: the advanced mode apart, then the 4 buttons and the hour; nothing of the presets', async () => {
    const study = student();
    renderApp('/settings/anki', { study });
    expect(await screen.findByRole('heading', { name: 'Anki general' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Modo avanzado' })).toBeInTheDocument();
    const general = screen.getByRole('region', { name: 'General' });
    expect(within(general).getByRole('switch', { name: 'Mostrar los 4 botones' })).toBeEnabled();
    expect(within(general).getByLabelText('El siguiente día empieza a las')).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Avanzado' })).toBeNull();
    expect(screen.queryByLabelText('Límite del estudio por adelantado')).toBeNull();
    expect(screen.queryByText('Configuración de mazos')).toBeNull();
    await userEvent.click(screen.getByRole('switch', { name: /Mostrar los 4 botones/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(async () => expect((await study.preferences())?.fourButtons).toBe(true));
  });

  it('turning on the full mode brings everything back', async () => {
    const study = student();
    renderApp('/settings/anki', { study });
    await userEvent.click(await screen.findByRole('switch', { name: /Modo avanzado/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    const extras = await screen.findByRole('region', { name: 'Avanzado' });
    expect(within(extras).getByLabelText('Límite del estudio por adelantado')).toBeInTheDocument();
    // The 4 buttons are still a choice of their own.
    expect(screen.getByRole('switch', { name: 'Mostrar los 4 botones' })).toBeEnabled();
    expect(screen.getByRole('switch', { name: 'Mostrar los 4 botones' })).not.toBeChecked();
    expect((await screen.findAllByText('Configuración de mazos')).length).toBeGreaterThan(0);
    expect((await study.preferences())?.fullAnki).toBe(true);
  });

  it('«Configuración de mazos» goes to «Anki general» without the full mode, and stays with it', async () => {
    const simple = renderApp('/settings/deck-options', { study: student() });
    expect(await screen.findByRole('heading', { name: 'Anki general' })).toBeInTheDocument();
    simple.unmount();
    renderApp('/settings/deck-options', { study: fullAnkiStudy() });
    expect(
      await screen.findByRole('heading', { name: 'Configuración de mazos' }),
    ).toBeInTheDocument();
  });
});
