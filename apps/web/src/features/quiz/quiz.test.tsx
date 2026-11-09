import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { focusManager } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../../lib/api';
import { fakeApi, renderApp } from '../../test/render';
import { localQuizRepository } from './repository';
import type { QuizRepository, QuizStep } from './repository';
import { StepSaver } from './saver';

const BASE = '/semesters/2/courses/biologia-celular/tests/certamen-2/practica';

/** A repository in memory that remembers every step. */
function recording(storage: Storage | null = null) {
  const inner = localQuizRepository(storage);
  const steps: QuizStep[] = [];
  const repo: QuizRepository = {
    load: inner.load,
    save: async (s) => {
      steps.push(structuredClone(s));
      await inner.save(s);
    },
  };
  return { repo, steps };
}

/** A storage in memory that lives between two renders (a reload). */
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

const option = (name: RegExp) =>
  within(screen.getByRole('list', { name: 'Alternativas' })).getByRole('button', { name });

describe('the course page', () => {
  it('lists the tests of each assessment', async () => {
    renderApp('/semesters/2/courses/biologia-celular');
    // The dashboard's card: one test, straight to it.
    const link = await screen.findByRole('link', { name: /^Tests.*Práctica de Biocel/ });
    expect(link).toHaveAttribute('href', BASE);
    expect(link).toHaveTextContent('Práctica de Biocel · 4 preguntas');
  });

  it('the section of tests lists each one with its questions', async () => {
    renderApp('/semesters/2/courses/biologia-celular/assessments/certamen-2/tests');
    const link = await screen.findByRole('link', { name: 'Práctica de Biocel' });
    expect(link).toHaveAttribute('href', BASE);
    expect(screen.getByText('4 preguntas · 2 secciones')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Practicar' })).toHaveAttribute('href', BASE);
  });
});

describe('a practice test', () => {
  it('without a tab in the URL, opens the first one (or the last one used)', async () => {
    const { router } = renderApp(BASE);
    await waitFor(() => expect(router.state.location.pathname).toBe(`${BASE}/pautas`));
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      'Practica para el Certamen 2',
    );
  });

  it('the cover: tabs, groups, mode, notice and the list of the second tab', async () => {
    const user = userEvent.setup();
    const { router } = renderApp(`${BASE}/pautas`);
    const tabs = await screen.findByRole('tablist', { name: 'Secciones del test' });
    expect(
      within(tabs).getByRole('tab', { name: /Pautas de años pasados 3 preguntas/ }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('group', { name: 'Qué temas practicar' })).toBeInTheDocument();
    expect(screen.getByText('3 preguntas en total')).toBeInTheDocument();
    expect(screen.getByText('Aviso de las pautas')).toBeInTheDocument();
    expect(screen.getByLabelText(/Mezclar orden de alternativas/)).toBeInTheDocument();
    // Choosing only one group.
    await user.click(screen.getByRole('switch', { name: /Núcleo/ }));
    expect(screen.getByText('2 preguntas en total')).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: /Transcripción/ }));
    expect(screen.getByText('Elige al menos uno')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Comenzar' })).toBeDisabled();

    await user.click(within(tabs).getByRole('tab', { name: /Preguntas nuevas/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`${BASE}/nuevas`));
    expect(await screen.findByText('Materia que no salía')).toBeInTheDocument();
    // Without alternatives: no «Mezclar orden de alternativas»; one group: no groups to choose.
    expect(screen.queryByLabelText(/Mezclar orden de alternativas/)).toBeNull();
    expect(screen.queryByRole('group', { name: 'Qué clases practicar' })).toBeNull();
  });

  it('a round: right and wrong at once, explanations, «Saltar», results and the wrong ones again', async () => {
    const user = userEvent.setup();
    const { repo, steps } = recording();
    renderApp(`${BASE}/pautas`, { quiz: repo });
    await user.click(await screen.findByRole('button', { name: 'Comenzar' }));

    // 1: right, with the figure beside, its caption and the explanations.
    expect(
      await screen.findByRole('heading', { level: 2, name: '¿Qué muestra el gel?' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Un gel de RT-PCR.')).toBeInTheDocument();
    expect(screen.getByText('Pauta original')).toBeInTheDocument();
    expect(screen.getByText(/^Pregunta 1/).closest('.tag')).toHaveTextContent(
      'Pregunta 1 · Certamen 2021',
    );
    expect(screen.getByRole('img', { name: 'Gel' })).toBeInTheDocument();
    expect(screen.getByText('Imagen recreada a partir de la original.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
    await user.click(option(/Splicing alternativo/));
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Correcta');
    expect(screen.getByText('Por qué cada alternativa')).toBeInTheDocument();
    expect(screen.getByText('Idea clave')).toBeInTheDocument();
    // What a revision changed in the question is not shown (the owner, 2026-11-01).
    expect(screen.queryByText(/Qué se cambió/)).toBeNull();
    expect(option(/Nada/)).toBeDisabled();
    expect(screen.getByLabelText('1 buenas y 0 malas')).toBeInTheDocument();

    // 2: a table; «Saltar» leaves it for the end, without counting it.
    await user.keyboard('{Enter}');
    expect(
      await screen.findByRole('heading', { level: 2, name: '¿Dónde se une TBP?' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '1 min' })).toHaveClass('hl');
    expect(screen.getByText(/saltar/, { selector: '.atajo' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Saltar' }));

    // 3: a photo, on the same place of the round; the skipped one is still to come.
    expect(
      await screen.findByRole('heading', { level: 2, name: '¿Qué es la lámina?' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Pregunta actual')).toHaveTextContent('2 / 3');
    expect(screen.getByLabelText('1 buenas y 0 malas')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Micrografía' })).toHaveAttribute(
      'src',
      '/api/media/tests/x.webp',
    );
    await user.click(option(/Microtúbulos/));
    // Answered: «Saltar» goes away (its place stays).
    expect(screen.queryByRole('button', { name: 'Saltar' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));

    // The skipped one, last: it cannot be skipped again. Wrong, with the keyboard.
    expect(
      await screen.findByRole('heading', { level: 2, name: '¿Dónde se une TBP?' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Pregunta actual')).toHaveTextContent('3 / 3');
    expect(screen.getByRole('button', { name: 'Saltar' })).toBeDisabled();
    await user.keyboard('s');
    expect(
      screen.getByRole('heading', { level: 2, name: '¿Dónde se une TBP?' }),
    ).toBeInTheDocument();
    await user.keyboard('2');
    expect(screen.getByText('Incorrecta. La correcta es la A')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ver resultado' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hay que repasar' }),
    ).toBeInTheDocument();
    expect(screen.getByText('33%')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Para repasar (2)' })).toBeInTheDocument();

    // «Repetir solo las malas»: the two wrong ones, in the order they were asked.
    await user.click(screen.getByRole('button', { name: 'Repetir solo las malas' }));
    expect(
      await screen.findByRole('heading', { level: 2, name: '¿Qué es la lámina?' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Pregunta actual')).toHaveTextContent('1 / 2');
    // «Saltar» there too.
    await user.click(screen.getByRole('button', { name: 'Saltar' }));
    expect(
      await screen.findByRole('heading', { level: 2, name: '¿Dónde se une TBP?' }),
    ).toBeInTheDocument();

    // What was saved: the round of the cover with its 3 answers, finished; then the new one.
    await waitFor(() => expect(steps.at(-1)?.roundInfo?.origin).toBe('repeat_wrong'));
    const answers = steps
      .filter((s) => s.answer)
      .map((s) => [s.answer!.questionId, s.answer!.correct]);
    expect(answers).toEqual([
      ['D-p01-03', true],
      ['A-p04-36', false],
      ['D-p02-04', false],
    ]);
    // The round saved with the skipped one at the end (and its answer at that place).
    const finished = steps.find((s) => s.roundInfo?.finished)!;
    expect((finished.round as { queue: string[] }).queue).toEqual([
      'D-p01-03',
      'A-p04-36',
      'D-p02-04',
    ]);
    expect(steps.filter((s) => s.answer).map((s) => s.answer!.position)).toEqual([0, 1, 2]);
    expect(steps.some((s) => s.roundInfo?.finished)).toBe(true);
  });

  it('a link opens the cover, reloading continues, «Volver» keeps the round, «Reiniciar» asks first', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    const first = renderApp(`${BASE}/pautas`, { quiz: localQuizRepository(storage) });
    await user.click(await screen.findByRole('button', { name: 'Comenzar' }));
    await user.click(await screen.findByRole('button', { name: /Splicing alternativo/ }));
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    await screen.findByRole('heading', { level: 2, name: '¿Dónde se une TBP?' });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    first.unmount();

    // Arriving from a link (the menu, the course): the cover, with the round to continue.
    const fromLink = renderApp(`${BASE}/pautas`, { quiz: localQuizRepository(storage) });
    expect(await screen.findByRole('region', { name: 'Ronda a medias' })).toBeInTheDocument();
    fromLink.unmount();

    // Reloading (the history entry remembers the round): the same question.
    const second = renderApp(
      { pathname: `${BASE}/pautas`, state: { inRound: true } },
      { quiz: localQuizRepository(storage) },
    );
    expect(
      await screen.findByRole('heading', { level: 2, name: '¿Dónde se une TBP?' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('1 buenas y 0 malas')).toBeInTheDocument();

    // «Volver», as studying a deck: the course and the assessment; the cover offers to continue.
    expect(screen.queryByRole('button', { name: /temas/i })).toBeNull();
    const back = screen.getByRole('button', { name: 'Volver a Biología celular · Certamen 2' });
    expect(back).toHaveAttribute('title', 'Biología celular · Certamen 2');
    expect(screen.queryByRole('button', { name: '← Volver' })).toBeNull();
    await user.click(back);
    const banner = await screen.findByRole('region', { name: 'Ronda a medias' });
    expect(banner).toHaveTextContent('Vas en la pregunta 2 de 3 · 1 buena y 0 malas');
    await user.click(within(banner).getByRole('button', { name: 'Continuar' }));
    expect(
      await screen.findByRole('heading', { level: 2, name: '¿Dónde se une TBP?' }),
    ).toBeInTheDocument();

    // «Reiniciar»: a dialog first; cancelling keeps everything.
    await user.click(screen.getByRole('button', { name: 'Reiniciar la ronda' }));
    const dialog = screen.getByRole('alertdialog', { name: '¿Reiniciar la ronda?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByLabelText('Pregunta actual')).toHaveTextContent('2 / 3');
    await user.click(screen.getByRole('button', { name: 'Reiniciar la ronda' }));
    await user.click(screen.getByRole('button', { name: 'Reiniciar' }));
    expect(
      await screen.findByRole('heading', { level: 2, name: '¿Qué muestra el gel?' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('0 buenas y 0 malas')).toBeInTheDocument();
    second.unmount();
  });

  it('«Saltar» survives a reload: the same question on screen and the skipped one at the end', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    const first = renderApp(`${BASE}/pautas`, { quiz: localQuizRepository(storage) });
    await user.click(await screen.findByRole('button', { name: 'Comenzar' }));
    await screen.findByRole('heading', { level: 2, name: '¿Qué muestra el gel?' });
    await user.keyboard('S');
    await screen.findByRole('heading', { level: 2, name: '¿Dónde se une TBP?' });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    first.unmount();

    const second = renderApp(
      { pathname: `${BASE}/pautas`, state: { inRound: true } },
      { quiz: localQuizRepository(storage) },
    );
    expect(
      await screen.findByRole('heading', { level: 2, name: '¿Dónde se une TBP?' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Pregunta actual')).toHaveTextContent('1 / 3');
    expect(screen.getByLabelText('0 buenas y 0 malas')).toBeInTheDocument();
    await user.keyboard('1');
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    await screen.findByRole('heading', { level: 2, name: '¿Qué es la lámina?' });
    await user.click(option(/Microtúbulos/));
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    // The skipped one comes back, last.
    expect(
      await screen.findByRole('heading', { level: 2, name: '¿Qué muestra el gel?' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Pregunta actual')).toHaveTextContent('3 / 3');
    second.unmount();
  });

  it('a question with a short answer: show it, then say whether you knew it', async () => {
    const user = userEvent.setup();
    renderApp(`${BASE}/nuevas`);
    await user.click(await screen.findByRole('button', { name: 'Comenzar' }));
    expect(
      await screen.findByRole('heading', { level: 2, name: '¿Qué hebra se copia?' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('La molde')).toBeNull();
    await user.keyboard(' ');
    expect(screen.getByText('La molde')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '✗ No la sabía' }));
    expect(screen.getByText('Para repasar')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ver resultado' }));
    expect(await screen.findByText('0%')).toBeInTheDocument();
  });

  it('after half an hour the section comes again (new photo URLs); if that fails, the round goes on', async () => {
    const user = userEvent.setup();
    const base = fakeApi();
    let calls = 0;
    const api = fakeApi({
      quizSection: async (id, section, signal) => {
        calls++;
        if (calls > 1) throw new ApiRequestError(500, 'internal', 'Algo falló.');
        return base.quizSection(id, section, signal);
      },
    });
    renderApp(`${BASE}/pautas`, { api });
    await user.click(await screen.findByRole('button', { name: 'Comenzar' }));
    await user.click(await screen.findByRole('button', { name: /Splicing alternativo/ }));
    expect(calls).toBe(1);
    // Coming back to the page 31 minutes later.
    const later = Date.now() + 31 * 60_000;
    const now = vi.spyOn(Date, 'now').mockReturnValue(later);
    try {
      act(() => {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
      });
      await waitFor(() => expect(calls).toBe(2));
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
    } finally {
      now.mockRestore();
      focusManager.setFocused(undefined);
    }
    expect(
      screen.getByRole('heading', { level: 2, name: '¿Qué muestra el gel?' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Correcta')).toBeInTheDocument();
    expect(screen.queryByText('Algo falló.')).toBeNull();
  });

  it('a test or tab that does not exist: not found', async () => {
    renderApp(`${BASE}/otra`);
    expect(
      await screen.findByRole('heading', { name: /no aparece ni en el Netter/ }),
    ).toBeInTheDocument();
  });
});

describe('saving the steps', () => {
  it('in order; a move joins the step waiting, an answer is never dropped', async () => {
    const saved: QuizStep[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const saver = new StepSaver({
      load: async () => ({}),
      save: async (s) => {
        if (!saved.length) await gate;
        saved.push(s);
      },
    });
    const info = {
      id: 'r1',
      origin: 'cover' as const,
      questionCount: 2,
      shuffled: false,
      shuffleOptions: false,
      startedAt: '',
      finished: false,
    };
    const step = (round: unknown, extra: Partial<QuizStep> = {}): QuizStep => ({
      quizId: 'q',
      sectionId: 's',
      round,
      roundInfo: info,
      ...extra,
    });
    const answer = {
      roundId: 'r1',
      questionId: 'a',
      position: 0,
      chosen: 0,
      correct: true,
      answeredAt: '',
    };
    saver.push(step(1)); // in flight
    saver.push(step(2, { answer }));
    saver.push(step(3)); // joins the answer
    saver.push(step(4, { answer: { ...answer, position: 1 } })); // another answer: its own
    expect(saver.pending).toBe(3);
    release();
    await saver.flush();
    expect(saved.map((s) => [s.round, s.answer?.position ?? null])).toEqual([
      [1, null],
      [3, 0],
      [4, 1],
    ]);
  });

  it('retries, then stops and keeps the step for «Reintentar»', async () => {
    let fail = 3;
    const saved: unknown[] = [];
    const saver = new StepSaver(
      {
        load: async () => ({}),
        save: async (s) => {
          if (fail-- > 0) throw new Error('sin conexión');
          saved.push(s.round);
        },
      },
      [1, 1],
    );
    saver.push({ quizId: 'q', sectionId: 's', round: 'x' });
    await saver.flush();
    expect(saver.failed?.message).toBe('sin conexión');
    expect(saver.pending).toBe(1);
    saver.retry();
    await saver.flush();
    expect(saver.failed).toBeNull();
    expect(saved).toEqual(['x']);
  });
});

describe('the demo repository', () => {
  it('as the database: an answer once, the replaced round abandoned, the finished one finished', async () => {
    const storage = memoryStorage();
    const repo = localQuizRepository(storage);
    const info = (id: string, finished = false) => ({
      id,
      origin: 'cover' as const,
      questionCount: 1,
      shuffled: false,
      shuffleOptions: false,
      startedAt: '',
      finished,
    });
    const answer = {
      roundId: 'r1',
      questionId: 'a',
      position: 0,
      chosen: 0,
      correct: true,
      answeredAt: '',
    };
    await repo.save({
      quizId: 'q',
      sectionId: 's',
      preferences: { groups: ['01'] },
      round: { id: 'r1' },
      roundInfo: info('r1'),
    });
    await repo.save({
      quizId: 'q',
      sectionId: 's',
      round: { id: 'r1' },
      roundInfo: info('r1'),
      answer,
    });
    await repo.save({
      quizId: 'q',
      sectionId: 's',
      round: { id: 'r1' },
      roundInfo: info('r1'),
      answer,
    });
    await repo.save({ quizId: 'q', sectionId: 's', round: { id: 'r2' }, roundInfo: info('r2') });
    const data = JSON.parse(storage.getItem('qv-demo-quiz')!) as {
      rounds: { id: string; status: string }[];
      answers: unknown[];
    };
    expect(data.rounds.map((r) => [r.id, r.status])).toEqual([
      ['r1', 'abandoned'],
      ['r2', 'active'],
    ]);
    expect(data.answers).toHaveLength(1);
    const back = await repo.load('q');
    expect(back.s).toMatchObject({ preferences: { groups: ['01'] }, round: { id: 'r2' } });
    expect(await repo.load('otro')).toEqual({});
  });
});
