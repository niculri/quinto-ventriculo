import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Catalog } from '@qv/schema';
import { CATALOG, DECK, fakeApi, fullAnkiStudy, renderApp } from '../../test/render';
import { cardShadowRoot } from '../decks/CardFrame';
import { dateOfDay } from './pace';
import { roughToday } from './queries';
import { localStudyRepository } from './repository';
import type { CardRef, StudyRepository } from './repository';

const WEEK_ID = '5';
const ASSESSMENT_ID = '4';
const COURSE_PATH = '/semesters/1/courses/anatomia-1';
const ASSESSMENT_PATH = `${COURSE_PATH}/anki/certamen-1`;
const REVIEW_PATH = `${ASSESSMENT_PATH}/review`;

const inDays = (n: number) => dateOfDay(roughToday() + n);

async function student() {
  const study = localStudyRepository(null, { welcomeSeen: true });
  await study.setDeckActivation(WEEK_ID, true);
  return study;
}

async function withDate(study: StudyRepository, days: number, over: object = {}) {
  await study.saveAssessmentSetting({
    deckId: ASSESSMENT_ID,
    includeExtras: false,
    newPerDay: null,
    examDate: inDays(days),
    ...over,
  });
  return study;
}

async function options() {
  return screen.findByRole('region', { name: 'Opciones de Certamen 1' });
}
const dateField = (box: HTMLElement) => within(box).getByLabelText('Fecha de la prueba');
const numberField = (box: HTMLElement) =>
  within(box).getByRole('spinbutton', { name: 'Tarjetas nuevas por día' });

/** Answers the first card of the deck, so that there is something seen. */
async function seenCards(study: StudyRepository) {
  const refs: CardRef[] = DECK.cards
    .filter((c) => c.deckId === '20')
    .map((c) => ({ noteGuid: c.noteGuid, ord: c.ord, deckId: c.deckId }));
  const now = Date.now();
  for (const [i, card] of refs.entries()) {
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
        difficulty: i === 0 ? 8 : 3,
        reps: 1,
        lapses: 0,
        lastReview: new Date(now - i * 1000).toISOString(),
        suspended: false,
        leech: false,
      },
      bury: [],
      buriedUntil: null,
    });
  }
  return refs;
}

describe('the date of a test, on the assessment’s page', () => {
  it('without a date: the student’s number, a pace that cannot be chosen yet', async () => {
    const study = await student();
    renderApp(ASSESSMENT_PATH, { study });
    const box = await options();
    await waitFor(() => expect(numberField(box)).toHaveValue(20));
    expect(numberField(box)).toBeEnabled();
    // What the date means does not appear until there is one.
    expect(within(box).queryByRole('status')).toBeNull();
    expect(within(box).queryByRole('radiogroup')).toBeNull();
    expect(within(box).getByRole('button', { name: 'Sacar la fecha', hidden: true })).toHaveClass(
      'invisible',
    );
  });

  it('with a date the number is computed and cannot be edited; without it, the student’s again', async () => {
    const study = await student();
    await study.saveAssessmentSetting({
      deckId: ASSESSMENT_ID,
      includeExtras: false,
      newPerDay: 35,
    });
    renderApp(ASSESSMENT_PATH, { study });
    const box = await options();
    await waitFor(() => expect(numberField(box)).toHaveValue(35));
    fireEvent.change(dateField(box), { target: { value: inDays(4) } });
    // 3 cards in the deck (and Extras apart), one day to see them with «Normal».
    await waitFor(() => expect(numberField(box)).toBeDisabled());
    expect(numberField(box)).toHaveValue(3);
    expect(box).toHaveTextContent(
      'Lo calcula el sitio con tu fecha. Si la sacas, vuelve a ser 35.',
    );
    expect(within(box).getByRole('status')).toHaveTextContent(/^Faltan 4 días · quedan 3 nuevas/);
    const load = await screen.findByRole('group', { name: 'Para hoy' });
    await waitFor(() => expect(load).toHaveTextContent(/^3 para hoy/));

    const saved = (await study.assessmentSettings())[0]!;
    expect(saved).toMatchObject({ examDate: inDays(4), newPerDay: 35 });
    expect(saved.examDateSetAt).toBeTruthy();

    await userEvent.click(within(box).getByRole('button', { name: 'Sacar la fecha' }));
    await waitFor(() => expect(numberField(box)).toBeEnabled());
    expect(numberField(box)).toHaveValue(35);
    expect((await study.assessmentSettings())[0]).toMatchObject({
      examDate: null,
      newPerDay: 35,
    });
  });

  it('each choice of days says what it means with numbers, and choosing one changes the number', async () => {
    const study = await withDate(await student(), 8);
    renderApp(ASSESSMENT_PATH, { study });
    const box = await options();
    const name = (days: string) => new RegExp(`^${days} solo para repasar`);
    const three = await within(box).findByRole('radio', { name: name('3 días') });
    await waitFor(() => expect(three).toBeEnabled());
    expect(three).toBeChecked();
    const choice = (days: string) =>
      within(box)
        .getByRole('radio', { name: name(days) })
        .closest('label')!;
    // 3 cards: over 7 days, 5 days, 1 day.
    expect(choice('1 día')).toHaveTextContent(
      /1 día · FácilFácilNuevas hasta el .+1 nueva al día~\d+ min al día/,
    );
    expect(choice('3 días')).toHaveTextContent(
      /3 días · MedioMedioNuevas hasta el .+1 nueva al día~\d+ min al día/,
    );
    expect(choice('7 días')).toHaveTextContent(
      /7 días · IntensivoIntensivoNuevas hasta el .+3 nuevas al día~\d+ min al día/,
    );
    expect(numberField(box)).toHaveValue(1);
    await userEvent.click(within(box).getByRole('radio', { name: name('7 días') }));
    await waitFor(() => expect(numberField(box)).toHaveValue(3));
    expect((await study.assessmentSettings())[0]).toMatchObject({ finalReviewDays: 7 });
  });

  it('a date that passed: back to the number, without an error, and it suggests the next one', async () => {
    const study = await withDate(await student(), -2, { newPerDay: 9 });
    renderApp(ASSESSMENT_PATH, { study });
    const box = await options();
    await waitFor(() => expect(numberField(box)).toHaveValue(9));
    expect(numberField(box)).toBeEnabled();
    expect(within(box).getByRole('status')).toHaveTextContent(/ya pasó.*próxima prueba/);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('with nothing turned on, it asks for that', async () => {
    const study = localStudyRepository(null, { welcomeSeen: true });
    await withDate(study, 10);
    renderApp(ASSESSMENT_PATH, { study });
    const box = await options();
    await waitFor(() =>
      expect(within(box).getByRole('status')).toHaveTextContent(/Activa una semana o clase/),
    );
    expect(numberField(box)).toBeDisabled();
    expect(numberField(box)).toHaveValue(null);
  });

  it('the days of the final review: 0, and the review stands out', async () => {
    const study = await withDate(await student(), 2);
    await seenCards(study);
    renderApp(ASSESSMENT_PATH, { study });
    const box = await options();
    await waitFor(() => expect(numberField(box)).toHaveValue(0));
    expect(within(box).getByRole('status')).toHaveTextContent(/días de repaso final/);
    expect(await screen.findByRole('link', { name: 'Repaso final' })).toHaveClass('border-brand');
  });

  it('an unfinished date is not saved; leaving the field empty takes it away', async () => {
    const study = await student();
    renderApp(ASSESSMENT_PATH, { study });
    const box = await options();
    await waitFor(() => expect(numberField(box)).toBeEnabled());
    fireEvent.change(dateField(box), { target: { value: '0020-11-05' } });
    expect(await study.assessmentSettings()).toEqual([]);
    fireEvent.blur(dateField(box));
    await waitFor(() => expect(dateField(box)).toHaveValue(''));
    expect(await study.assessmentSettings()).toEqual([]);
  });

  it('a failure to save says so', async () => {
    const study = await student();
    study.saveAssessmentSetting = () => Promise.reject(new Error('sin conexión'));
    renderApp(ASSESSMENT_PATH, { study });
    const box = await options();
    await waitFor(() => expect(numberField(box)).toBeEnabled());
    fireEvent.change(dateField(box), { target: { value: inDays(5) } });
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar');
    await waitFor(() => expect(numberField(box)).toBeEnabled());
  });
});

describe('the date the author suggests', () => {
  function suggesting(date: string): Catalog {
    const catalog = structuredClone(CATALOG);
    catalog.semesters[0]!.courses[0]!.assessments[0]!.suggestedDate = date;
    return catalog;
  }

  it('is offered while it is ahead, and using it saves it as the student’s', async () => {
    const study = await student();
    renderApp(ASSESSMENT_PATH, {
      study,
      api: fakeApi({ catalog: async () => suggesting(inDays(9)) }),
    });
    const box = await options();
    await waitFor(() => expect(numberField(box)).toBeEnabled());
    const use = within(box).getByRole('button', { name: /^Usar el \d+ de \w+/ });
    await userEvent.click(use);
    await waitFor(() => expect(dateField(box)).toHaveValue(inDays(9)));
    expect((await study.assessmentSettings())[0]).toMatchObject({ examDate: inDays(9) });
    // In its place, without taking it away.
    expect(use).toHaveClass('invisible');
  });

  it('one that passed does not show', async () => {
    renderApp(ASSESSMENT_PATH, {
      study: await student(),
      api: fakeApi({ catalog: async () => suggesting(inDays(-1)) }),
    });
    const box = await options();
    await waitFor(() => expect(numberField(box)).toBeEnabled());
    expect(within(box).queryByRole('button', { name: /^Usar el/ })).toBeNull();
  });

  it('none, as today: nothing to offer', async () => {
    renderApp(ASSESSMENT_PATH, { study: await student() });
    const box = await options();
    await waitFor(() => expect(numberField(box)).toBeEnabled());
    expect(within(box).queryByRole('button', { name: /^Usar el/ })).toBeNull();
  });
});

describe('«Modo avanzado»', () => {
  it('the pages of the decks are the same, with a configuration for each deck', async () => {
    const study = fullAnkiStudy();
    await study.saveAssessmentSetting({
      deckId: ASSESSMENT_ID,
      includeExtras: false,
      newPerDay: null,
      examDate: inDays(5),
    });
    const { router } = renderApp(ASSESSMENT_PATH, { study });
    expect(await screen.findByLabelText('Fecha de la prueba')).toBeInTheDocument();
    expect(await screen.findByRole('switch', { name: /Activar S1/ })).toBeInTheDocument();
    expect(screen.getByText('Repaso final')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Submazos' })).toBeNull();
    expect(
      await screen.findByRole('button', { name: 'Configuración de S1 - Semana de prueba' }),
    ).toBeInTheDocument();
    await act(() => router.navigate(COURSE_PATH));
    expect(await screen.findByText(/Faltan \d+ días/)).toBeInTheDocument();
    await act(() => router.navigate(REVIEW_PATH));
    expect(await screen.findByRole('heading', { name: /Repaso final/ })).toBeInTheDocument();
  });
});

describe('dominio and the summary', () => {
  it('on the rows and the card of the course’s board, with the summary of the date', async () => {
    const study = await withDate(await student(), 12);
    await seenCards(study);
    renderApp(COURSE_PATH, { study });
    const summary = await screen.findByText('Faltan 12 días · vas al día');
    expect(summary).toBeInTheDocument();
    await waitFor(() =>
      expect(document.querySelectorAll('[data-mastery]').length).toBeGreaterThan(0),
    );
    const meter = document.querySelector('[data-mastery]')!;
    expect(meter).toHaveTextContent(/\d+ % de dominio/);
    expect(within(meter as HTMLElement).getByRole('tooltip', { hidden: true })).toHaveTextContent(
      /cuánto recordarías hoy/,
    );
  });

  it('without a date there is no summary, and with nothing seen, 0 %', async () => {
    renderApp(COURSE_PATH, { study: await student() });
    await waitFor(() => expect(document.querySelector('[data-mastery]')).toBeTruthy());
    expect(document.querySelector('[data-mastery]')).toHaveTextContent('0 %');
    expect(screen.queryByText(/Faltan \d+ días/)).toBeNull();
  });

  it('a touch on it does not follow the link of the card', async () => {
    const study = await student();
    const { router } = renderApp(COURSE_PATH, { study });
    await waitFor(() => expect(document.querySelector('a [data-mastery]')).toBeTruthy());
    await userEvent.click(document.querySelector('a [data-mastery]')!);
    expect(router.state.location.pathname).toBe(COURSE_PATH);
  });

  it('on the home page, with the nearest test', async () => {
    const study = await withDate(await student(), 6);
    renderApp('/home', { study });
    expect(await screen.findByText('Certamen 1 · Faltan 6 días · vas al día')).toBeInTheDocument();
  });
});

describe('the final review', () => {
  async function cardText(label: RegExp) {
    const region = await screen.findByRole('region', { name: label });
    await waitFor(() => expect(cardShadowRoot(region)?.querySelector('.card')).toBeTruthy());
    return cardShadowRoot(region)!.querySelector('.card')!.textContent ?? '';
  }

  /** Everything saved of the student's progress. */
  async function saved(study: StudyRepository) {
    const rows = await study.allCards();
    const logs = await Promise.all(rows.map((r) => study.cardLog(r)));
    return JSON.stringify({ rows, logs });
  }

  it('its link is there but does not work until something was seen', async () => {
    renderApp(ASSESSMENT_PATH, { study: await student() });
    const button = await screen.findByRole('button', { name: 'Repaso final' });
    expect(button).toBeDisabled();
    expect(screen.queryByRole('link', { name: 'Repaso final' })).toBeNull();
  });

  it('with nothing seen the page says so', async () => {
    renderApp(REVIEW_PATH, { study: await student() });
    expect(await screen.findByText(/Todavía no has visto tarjetas/)).toBeInTheDocument();
    for (const link of screen.getAllByRole('link', { name: 'Volver a Certamen 1' })) {
      expect(link).toHaveAttribute('href', ASSESSMENT_PATH);
    }
  });

  it('answering writes nothing: neither the state of the cards nor the log', async () => {
    const study = await student();
    await seenCards(study);
    const before = await saved(study);
    const writes: string[] = [];
    for (const name of [
      'recordReview',
      'bury',
      'suspend',
      'setFlag',
      'setFlags',
      'unsuspend',
      'unbury',
      'forget',
      'undo',
      'saveAssessmentSetting',
      'setDeckActivation',
      'savePreferences',
    ] as const) {
      const real = study[name] as (...a: unknown[]) => Promise<unknown>;
      (study as unknown as Record<string, unknown>)[name] = (...a: unknown[]) => {
        writes.push(name);
        return real(...a);
      };
    }
    renderApp(REVIEW_PATH, { study });
    expect(
      await screen.findByText('Este repaso no cambia las fechas de tus tarjetas.'),
    ).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: /^Todo lo visto/ }));
    // It said it once.
    expect(screen.queryByText(/no cambia las fechas/)).toBeNull();

    await cardText(/Frente de la tarjeta/);
    expect(screen.getByText('Repaso final · quedan 3')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: ' ' });
    await cardText(/Reverso de la tarjeta/);
    const answers = screen.getByRole('group', { name: 'Responder' });
    expect(
      within(answers)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Otra vez', 'Bien']);
    // «Otra vez» goes back to the end: still 3.
    fireEvent.keyDown(window, { key: '1' });
    await cardText(/Frente de la tarjeta/);
    expect(screen.getByText('Repaso final · quedan 3')).toBeInTheDocument();
    for (const left of [2, 1]) {
      fireEvent.keyDown(window, { key: ' ' });
      await cardText(/Reverso de la tarjeta/);
      fireEvent.keyDown(window, { key: '2' });
      await screen.findByText(`Repaso final · quedan ${left}`);
    }
    fireEvent.keyDown(window, { key: ' ' });
    await cardText(/Reverso de la tarjeta/);
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Responder' })).getByRole('button', {
        name: 'Bien',
      }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Terminaste el repaso' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/3 tarjetas · «Otra vez» 1 vez/)).toBeInTheDocument();

    expect(writes).toEqual([]);
    expect(await saved(study)).toBe(before);
  });

  it('marking is the one thing that saves, and it does not touch the dates', async () => {
    const study = await student();
    const refs = await seenCards(study);
    const dates = async () =>
      (await study.allCards()).map((r) => [r.noteGuid, r.ord, r.due, r.interval, r.reps]);
    const before = await dates();
    renderApp(REVIEW_PATH, { study });
    await userEvent.click(await screen.findByRole('button', { name: /^Todo lo visto/ }));
    await cardText(/Frente de la tarjeta/);
    await userEvent.click(screen.getByRole('button', { name: 'Más' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Marcar para revisar' }));
    expect(await screen.findByLabelText('Marcada para revisar')).toBeInTheDocument();
    await waitFor(async () =>
      expect((await study.allCards()).filter((r) => r.flag !== 0)).toHaveLength(1),
    );
    expect(await dates()).toEqual(before);
    expect(refs.length).toBeGreaterThan(0);
  });

  it('«Reportar error» works from there', async () => {
    const study = await student();
    await seenCards(study);
    renderApp(REVIEW_PATH, { study });
    await userEvent.click(await screen.findByRole('button', { name: /^Todo lo visto/ }));
    await cardText(/Frente de la tarjeta/);
    await userEvent.click(screen.getByRole('button', { name: 'Más' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Reportar error' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reportar error' });
    await userEvent.type(within(dialog).getByLabelText('¿Qué está mal?'), 'Una falta');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('Gracias: tu reporte le llegó al autor.')).toBeInTheDocument();
  });

  it('the last day with new cards: «Listo por hoy» does not promise more for tomorrow', async () => {
    // 4 days left, 3 of final review: everything comes out today, the two cards of a note too.
    const study = await withDate(await student(), 4);
    renderApp(`${ASSESSMENT_PATH}/study`, { study });
    const done = () => screen.queryByRole('heading', { name: 'Listo por hoy' });
    await waitFor(() =>
      expect(done() ?? screen.getByRole('button', { name: 'Mostrar respuesta' })).toBeTruthy(),
    );
    for (let i = 0; i < 20 && !done(); i++) {
      await userEvent.click(screen.getByRole('button', { name: 'Mostrar respuesta' }));
      await userEvent.click(await screen.findByRole('button', { name: /^Bien/ }));
      await waitFor(() =>
        expect(done() ?? screen.getByRole('button', { name: 'Mostrar respuesta' })).toBeTruthy(),
      );
    }
    expect(done()).toBeInTheDocument();
    expect(screen.queryByText(/Mañana salen más/)).toBeNull();
    expect(screen.queryByText(/salen desde mañana/)).toBeNull();
  });

  it('a mark made in a round counts for the next one', async () => {
    const study = await withDate(await student(), 20);
    await seenCards(study);
    renderApp(REVIEW_PATH, { study });
    const hard = await screen.findByRole('button', { name: /^Solo lo marcado/ });
    expect(hard).toHaveTextContent('1 tarjeta');
    await userEvent.click(screen.getByRole('button', { name: /^Todo lo visto/ }));
    const more = await screen.findByRole('button', { name: 'Más' });
    await userEvent.click(more);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Marcar para revisar' }));
    await screen.findByLabelText('Marcada para revisar');
    // To the end of the round.
    for (let left = 10; left > 0 && !screen.queryByText('Terminaste el repaso'); left--) {
      await userEvent.click(screen.getByRole('button', { name: 'Mostrar respuesta' }));
      await userEvent.click(screen.getByRole('button', { name: 'Bien' }));
      await waitFor(() =>
        expect(
          screen.queryByRole('button', { name: 'Mostrar respuesta' }) ??
            screen.getByText('Terminaste el repaso'),
        ).toBeInTheDocument(),
      );
    }
    await userEvent.click(await screen.findByRole('button', { name: 'Otro repaso' }));
    expect(await screen.findByRole('button', { name: /^Solo lo marcado/ })).toHaveTextContent(
      '2 tarjetas',
    );
  });

  it('a round goes on when a new day starts', async () => {
    const study = await withDate(await student(), 20);
    await seenCards(study);
    const answersSince = study.answersSince.bind(study);
    let calls = 0;
    // From the second day on, the reading never arrives.
    const waiting: StudyRepository = {
      ...study,
      answersSince: (since) => (++calls > 2 ? new Promise(() => {}) : answersSince(since)),
    };
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    try {
      vi.setSystemTime(new Date('2026-11-02T03:58:30-03:00'));
      renderApp(REVIEW_PATH, { study: waiting });
      await userEvent.click(await screen.findByRole('button', { name: /^Todo lo visto/ }));
      await screen.findByRole('button', { name: 'Mostrar respuesta' });
      calls = 3;
      act(() => {
        vi.setSystemTime(new Date('2026-11-02T04:01:00-03:00'));
        vi.advanceTimersByTime(60_000);
      });
      await act(async () => {});
      expect(screen.queryByText('Preparando tus tarjetas…')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Mostrar respuesta' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('only the marked and the difficult ones', async () => {
    const study = await student();
    await seenCards(study);
    renderApp(REVIEW_PATH, { study });
    const hard = await screen.findByRole('button', { name: /^Solo lo marcado y lo difícil/ });
    expect(hard).toHaveTextContent('1 tarjeta');
    await userEvent.click(hard);
    await cardText(/Frente de la tarjeta/);
    expect(screen.getByText('Repaso final · quedan 1')).toBeInTheDocument();
  });

  it('is only for an assessment', async () => {
    renderApp(`${COURSE_PATH}/anki/certamen-1/s1-semana-de-prueba/review`, {
      study: await student(),
    });
    expect(await screen.findByText(/no aparece ni en el Netter/)).toBeInTheDocument();
  });

  it('from «Listo por hoy»', async () => {
    const study = await student();
    await seenCards(study);
    renderApp(`${ASSESSMENT_PATH}/study`, { study });
    const link = await screen.findByRole('link', { name: 'Repasar igual, sin cambiar fechas' });
    expect(link).toHaveAttribute('href', REVIEW_PATH);
  });
});
