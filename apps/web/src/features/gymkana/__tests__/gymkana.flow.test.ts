// The gymkana in the site: its card on the course's page and in the menu, its page (Anki and the writing mode's
// choices), a round written, corrected, turned around, reloaded and repeated, and what it never touches.
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../../../shared/lib/api';
import { fullAnkiStudy } from '../../../test/fakes/repositories';
import {
  GYM_DECK,
  GYM_INDEX,
  GYM_PAGE,
  GYM_WRITE,
  gymkanaApi,
} from '../../../test/fixtures/gymkana';
import { renderApp } from '../../../test/render';
import { localQuizRepository } from '../../quiz/api/repository';
import type { QuizRepository, QuizStep } from '../../quiz/api/repository';

function recording() {
  const inner = localQuizRepository(null);
  const steps: QuizStep[] = [];
  const repo: QuizRepository = {
    load: inner.load,
    openRounds: inner.openRounds,
    save: async (s) => {
      steps.push(structuredClone(s));
      await inner.save(s);
    },
  };
  return { repo, steps };
}

const answer = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
  const box = await screen.findByRole('textbox', { name: 'Tu respuesta' });
  if (text) await user.type(box, text);
  await user.click(screen.getByRole('button', { name: 'Responder' }));
};

beforeEach(() => {
  // No shuffle: the stations go in the order of the index.
  vi.spyOn(Math, 'random').mockReturnValue(0.999);
});
afterEach(() => vi.restoreAllMocks());

describe('where the gymkana is', () => {
  it('has its card on the course’s page and its link in the menu', async () => {
    renderApp('/semesters/2/courses/anatomia-2', { api: gymkanaApi() });
    const card = await screen.findByRole('link', { name: /^Gymkana.*3 estaciones/ });
    expect(card).toHaveAttribute('href', GYM_PAGE);
    const menu = screen.getAllByRole('navigation', { name: 'Menú del sitio' })[0]!;
    expect(within(menu).getByRole('link', { name: 'Gymkana' })).toHaveAttribute('href', GYM_PAGE);
  });
});

describe('the gymkana’s page', () => {
  it('counts the stations, turns the deck on and offers its filters', async () => {
    const user = userEvent.setup();
    const study = fullAnkiStudy();
    renderApp(GYM_PAGE, { api: gymkanaApi(), study });
    expect(await screen.findByText('3 estaciones · 2 son de prioridad 1')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Gymkana');
    expect(screen.getByRole('link', { name: 'Estudiar' })).toHaveAttribute(
      'href',
      '/semesters/2/courses/anatomia-2/anki/certamen-2/gymkana/study',
    );
    expect(screen.getByRole('link', { name: 'Ver las estaciones' })).toHaveAttribute(
      'href',
      '/semesters/2/courses/anatomia-2/anki/certamen-2/gymkana/cards',
    );
    const on = screen.getByRole('switch', { name: 'Activada en tu Anki' });
    await waitFor(() => expect(on).toBeEnabled());
    expect(on).not.toBeChecked();
    await user.click(on);
    await waitFor(() => expect(on).toBeChecked());

    expect(screen.getByText('2 estaciones elegidas')).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Prioridad 3' }));
    expect(screen.getByText('3 estaciones elegidas')).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Cuello' }));
    expect(screen.getByText('1 estación elegida')).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Atlas' }));
    expect(screen.getByText('Elige al menos una estación.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Comenzar' })).toBeDisabled();
    await user.click(screen.getByRole('switch', { name: 'Atlas' }));
    expect(screen.getByRole('button', { name: 'Comenzar' })).toBeEnabled();
  });

  it('says when it could not turn the deck on', async () => {
    const user = userEvent.setup();
    const study = fullAnkiStudy();
    study.setDeckActivations = async () => {
      throw new Error('red');
    };
    renderApp(GYM_PAGE, { api: gymkanaApi(), study });
    const on = await screen.findByRole('switch', { name: 'Activada en tu Anki' });
    await waitFor(() => expect(on).toBeEnabled());
    await user.click(on);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar');
  });

  it('without its card index, says so and tries again', async () => {
    let fail = true;
    const api = gymkanaApi();
    const cardIndex = api.cardIndex;
    const user = userEvent.setup();
    renderApp(GYM_PAGE, {
      api: {
        ...api,
        cardIndex: async (...a) => {
          if (fail) throw new ApiRequestError(500, 'internal', 'Falló.');
          return cardIndex(...a);
        },
      },
    });
    const retry = await screen.findByRole('button', { name: /Reintentar|Intentar de nuevo/ });
    fail = false;
    await user.click(retry);
    expect(await screen.findByText(/estaciones elegidas/)).toBeInTheDocument();
  });

  it('waits for the plan before its switch, and shows an error of the catalog or of the saved round', async () => {
    const study = fullAnkiStudy();
    study.deckActivations = () => new Promise(() => undefined);
    const first = renderApp(GYM_PAGE, { api: gymkanaApi(), study });
    expect(await screen.findByRole('switch', { name: 'Activada en tu Anki' })).toBeDisabled();
    first.unmount();

    const broken = renderApp(GYM_PAGE, {
      api: gymkanaApi({ catalog: async () => Promise.reject(new Error('red')) }),
    });
    await userEvent.click(
      await screen.findByRole('button', { name: /Reintentar|Intentar de nuevo/ }),
    );
    broken.unmount();

    const onePriority = renderApp(GYM_PAGE, {
      api: gymkanaApi({
        cardIndex: async () => ({
          ...GYM_INDEX,
          notes: GYM_INDEX.notes.map((n) => ({ ...n, fields: [...n.fields.slice(0, 3), '1'] })),
        }),
      }),
    });
    expect(await screen.findByText('3 estaciones')).toBeInTheDocument();
    onePriority.unmount();

    const user = userEvent.setup();
    const inner = localQuizRepository(null);
    let fail = true;
    renderApp(GYM_PAGE, {
      api: gymkanaApi(),
      quiz: {
        ...inner,
        load: async (id) => {
          if (fail) throw new Error('red');
          return inner.load(id);
        },
      },
    });
    const retry = await screen.findByRole('button', { name: /Reintentar|Intentar de nuevo/ });
    fail = false;
    await user.click(retry);
    expect(await screen.findByText(/estaciones elegidas/)).toBeInTheDocument();
  });

  it('is not found without its assessment or its gymkana, and goes to its semester', async () => {
    renderApp('/semesters/2/courses/anatomia-2/assessments/certamen-9/gymkana', {
      api: gymkanaApi(),
    });
    expect(
      await screen.findByRole('heading', { name: 'Esta página no aparece ni en el Netter' }),
    ).toBeInTheDocument();
  });

  it('a wrong semester goes to the right one', async () => {
    const { router } = renderApp('/semesters/3/courses/anatomia-2/assessments/certamen-2/gymkana', {
      api: gymkanaApi(),
    });
    await waitFor(() => expect(router.state.location.pathname).toBe(GYM_PAGE));
  });
});

describe('a round of writing the name', () => {
  it('answers, turns a verdict around, keeps the round on reload and repeats the wrong ones', async () => {
    const user = userEvent.setup();
    const { repo, steps } = recording();
    const study = fullAnkiStudy();
    const first = renderApp(GYM_PAGE, { api: gymkanaApi(), quiz: repo, study });
    await user.click(await screen.findByRole('button', { name: 'Comenzar' }));
    await waitFor(() => expect(first.router.state.location.pathname).toBe(GYM_WRITE));

    expect(await screen.findByText('Estación 1 de 2')).toBeInTheDocument();
    await answer(user, 'm. recto lateral');
    expect(await screen.findByText(/Buena$/)).toBeInTheDocument();
    expect(screen.getByText('Es:', { exact: false })).toHaveTextContent(
      'Es: Músculo recto lateral',
    );
    await user.click(screen.getByRole('button', { name: 'Contarla como mala' }));
    expect(screen.getByText(/Mala \(la corregiste tú\)/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Contarla como buena' }));
    await user.click(screen.getByRole('button', { name: 'Siguiente estación' }));

    expect(await screen.findByText('Estación 2 de 2')).toBeInTheDocument();
    await answer(user, 'carótida externa');
    expect(await screen.findByText(/✗ Mala/)).toBeInTheDocument();
    await waitFor(() => expect(steps.some((s) => s.answer?.correct === false)).toBe(true));
    first.unmount();

    // Reloading: the same round, where it was.
    const second = renderApp(GYM_WRITE, { api: gymkanaApi(), quiz: repo, study });
    expect(await screen.findByText('Estación 2 de 2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ver el resultado' }));
    expect(await screen.findByRole('heading', { name: '1 de 2 buenas' })).toBeInTheDocument();
    const rows = screen.getByRole('list', { name: 'Estaciones de la ronda' });
    expect(within(rows).getAllByRole('listitem')[0]).toHaveTextContent('Arteria carótida interna');
    expect(within(rows).getAllByRole('listitem')[1]).toHaveTextContent('corrección tuya');
    expect(within(rows).getAllByRole('listitem')[1]).toHaveTextContent('T-PR-G2-1.1');

    await user.click(screen.getByRole('button', { name: 'Repetir la mala' }));
    expect(await screen.findByText('Estación 1 de 1')).toBeInTheDocument();
    await answer(user, '');
    expect(await screen.findByText('sin respuesta')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ver el resultado' }));
    expect(await screen.findByRole('heading', { name: '0 de 1 buenas' })).toBeInTheDocument();

    // Saved as a test's steps, with the answers by code; the cards' dates, never.
    const answers = steps.flatMap((s) => (s.answer ? [s.answer] : []));
    expect(answers.map((a) => [a.questionId, a.correct, a.chosen])).toEqual([
      ['T-PR-G2-1', true, null],
      ['T-PR-G2-2', false, null],
      ['T-PR-G2-2', false, null],
    ]);
    expect(steps.every((s) => s.quizId === `gymkana-${GYM_DECK}` && s.sectionId === 'write')).toBe(
      true,
    );
    expect(await study.allCards()).toEqual([]);

    await user.click(screen.getByRole('link', { name: 'Otra ronda' }));
    await waitFor(() => expect(second.router.state.location.pathname).toBe(GYM_PAGE));
    expect(await screen.findByText('Tu última ronda: 0 de 1 buenas.')).toBeInTheDocument();
  });

  it('corrected at the end goes on at once; a half-done round can be resumed or dropped', async () => {
    const user = userEvent.setup();
    const { repo } = recording();
    renderApp(GYM_PAGE, { api: gymkanaApi(), quiz: repo });
    await user.click(await screen.findByRole('button', { name: /Corrección/ }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Al final' }));
    await user.click(screen.getByRole('button', { name: 'Comenzar' }));
    await answer(user, 'recto lateral');
    expect(await screen.findByText('Estación 2 de 2')).toBeInTheDocument();
    expect(screen.queryByText(/✓ 1/)).toBeNull();
    await user.click(screen.getByRole('link', { name: 'Volver a Gymkana' }));

    expect(
      await screen.findByText('Tienes una ronda a medias: 1 de 2 estaciones.'),
    ).toBeInTheDocument();
    expect(screen.getByText('La ronda a medias se descarta.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continuar' })).toHaveAttribute('href', GYM_WRITE);
    await user.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(screen.queryByText(/ronda a medias/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Comenzar' })).toBeInTheDocument();
  });

  it('with a time limit, answers what was written when the time is up', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
      renderApp(GYM_PAGE, { api: gymkanaApi() });
      await user.click(await screen.findByRole('button', { name: /Tiempo por estación/ }));
      await user.click(screen.getByRole('menuitemradio', { name: '15 segundos' }));
      await user.click(screen.getByRole('button', { name: /Estaciones por ronda/ }));
      await user.click(screen.getByRole('menuitemradio', { name: 'Todas' }));
      await user.click(screen.getByRole('button', { name: 'Comenzar' }));
      const bar = await screen.findByRole('progressbar', { name: 'Tiempo que queda' });
      expect(bar).toHaveAttribute('aria-valuenow', '15');
      await user.type(screen.getByRole('textbox', { name: 'Tu respuesta' }), 'recto');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      expect(bar).toHaveAttribute('aria-valuenow', '10');
      expect(bar.firstElementChild).toHaveClass('bg-brand');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
      expect(bar.firstElementChild).not.toHaveClass('bg-brand');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(9_000);
      });
      expect(await screen.findByText(/Se acabó el tiempo/)).toBeInTheDocument();
      expect(screen.queryByRole('progressbar')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('the writing page shows an error of the catalog, and is not found without a gymkana', async () => {
    const broken = renderApp(GYM_WRITE, {
      api: gymkanaApi({ catalog: async () => Promise.reject(new Error('red')) }),
    });
    await userEvent.click(
      await screen.findByRole('button', { name: /Reintentar|Intentar de nuevo/ }),
    );
    broken.unmount();
    const missing = renderApp(
      '/semesters/2/courses/anatomia-2/assessments/certamen-9/gymkana/write',
      {
        api: gymkanaApi(),
      },
    );
    expect(
      await screen.findByRole('heading', { name: 'Esta página no aparece ni en el Netter' }),
    ).toBeInTheDocument();
    missing.unmount();
    renderApp(GYM_WRITE, {
      api: gymkanaApi({ cardIndex: async () => Promise.reject(new Error('red')) }),
    });
    expect(
      await screen.findByRole('button', { name: /Reintentar|Intentar de nuevo/ }),
    ).toBeInTheDocument();
  });

  it('without a round, the writing page goes back to the gymkana', async () => {
    const { router } = renderApp(GYM_WRITE, { api: gymkanaApi() });
    await waitFor(() => expect(router.state.location.pathname).toBe(GYM_PAGE));
  });

  it('says when a step could not be saved, and saves it again', async () => {
    const user = userEvent.setup();
    const inner = localQuizRepository(null);
    let fail = true;
    const repo: QuizRepository = {
      ...inner,
      save: async (s) => {
        if (fail && s.answer) throw new Error('red');
        await inner.save(s);
      },
    };
    renderApp(GYM_PAGE, { api: gymkanaApi(), quiz: repo });
    await user.click(await screen.findByRole('button', { name: 'Comenzar' }));
    await answer(user, 'recto lateral');
    const alert = await screen.findByRole('alert', {}, { timeout: 5_000 });
    expect(alert).toHaveTextContent('No se pudo guardar tu ronda.');
    fail = false;
    await user.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});
