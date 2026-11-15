// Tests of the practice test pages: the course's lists, the cover, rounds, reloads and not found.
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { focusManager } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../../../shared/lib/api';
import { fakeApi, renderApp } from '../../../test/render';
import { localQuizRepository } from '../api/repository';
import type { QuizRepository, QuizStep } from '../api/repository';

const BASE = '/semesters/2/courses/biologia-celular/tests/certamen-2/practica';

function recording(storage: Storage | null = null) {
  const inner = localQuizRepository(storage);
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
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Tests');
    const crumbs = screen.getByRole('navigation', { name: /ruta|migas|breadcrumb/i });
    expect(within(crumbs).getAllByRole('listitem').at(-1)).toHaveTextContent('Tests');
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
    await user.click(screen.getByRole('switch', { name: /Núcleo/ }));
    expect(screen.getByText('2 preguntas en total')).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: /Transcripción/ }));
    expect(screen.getByText('Elige al menos uno')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Comenzar' })).toBeDisabled();

    await user.click(within(tabs).getByRole('tab', { name: /Preguntas nuevas/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`${BASE}/nuevas`));
    expect(await screen.findByText('Materia que no salía')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Mezclar orden de alternativas/)).toBeNull();
    expect(screen.queryByRole('group', { name: 'Qué clases practicar' })).toBeNull();
  });

  it('a round: right and wrong at once, explanations, «Saltar», results and the wrong ones again', async () => {
    const user = userEvent.setup();
    const { repo, steps } = recording();
    renderApp(`${BASE}/pautas`, { quiz: repo });
    await user.click(await screen.findByRole('button', { name: 'Comenzar' }));

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
    expect(screen.queryByText(/Qué se cambió/)).toBeNull();
    expect(option(/Nada/)).toBeDisabled();
    expect(screen.getByLabelText('1 buenas y 0 malas')).toBeInTheDocument();

    await user.keyboard('{Enter}');
    expect(
      await screen.findByRole('heading', { level: 2, name: '¿Dónde se une TBP?' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '1 min' })).toHaveClass('hl');
    expect(screen.getByText(/saltar/, { selector: '.atajo' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Saltar' }));

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
    expect(screen.queryByRole('button', { name: 'Saltar' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));

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

    await user.click(screen.getByRole('button', { name: 'Repetir solo las malas' }));
    expect(
      await screen.findByRole('heading', { level: 2, name: '¿Qué es la lámina?' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Pregunta actual')).toHaveTextContent('1 / 2');
    await user.click(screen.getByRole('button', { name: 'Saltar' }));
    expect(
      await screen.findByRole('heading', { level: 2, name: '¿Dónde se une TBP?' }),
    ).toBeInTheDocument();

    await waitFor(() => expect(steps.at(-1)?.roundInfo?.origin).toBe('repeat_wrong'));
    const answers = steps
      .filter((s) => s.answer)
      .map((s) => [s.answer!.questionId, s.answer!.correct]);
    expect(answers).toEqual([
      ['D-p01-03', true],
      ['A-p04-36', false],
      ['D-p02-04', false],
    ]);
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

    const fromLink = renderApp(`${BASE}/pautas`, { quiz: localQuizRepository(storage) });
    expect(await screen.findByRole('region', { name: 'Ronda a medias' })).toBeInTheDocument();
    fromLink.unmount();

    const second = renderApp(
      { pathname: `${BASE}/pautas`, state: { inRound: true } },
      { quiz: localQuizRepository(storage) },
    );
    expect(
      await screen.findByRole('heading', { level: 2, name: '¿Dónde se une TBP?' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('1 buenas y 0 malas')).toBeInTheDocument();

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
