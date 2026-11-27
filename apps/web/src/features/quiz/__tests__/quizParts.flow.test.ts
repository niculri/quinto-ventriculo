// Characterizes each part of a practice test page: the page's theme, redirects and errors, the remembered tab and the
// topics of a link, the cover, the bar, the keys, the focus, the figures, the results, reports and saving.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QuizSectionDetail } from '@qv/schema';
import { ApiRequestError } from '../../../shared/lib/api';
import { fakeApi } from '../../../test/fakes/api';
import { QUIZ } from '../../../test/fixtures/quiz';
import { renderApp } from '../../../test/render';
import { localReportsRepository } from '../../reports/api/repository';
import type { NewReport } from '../../reports/api/repository';
import { localQuizRepository } from '../api/repository';
import type { QuizRepository, QuizStep } from '../api/repository';
import { memoryStorage } from '../../../test/storage';

const COURSE = '/semesters/2/courses/biologia-celular';
const BASE = `${COURSE}/tests/certamen-2/practica`;

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function recording(save?: (s: QuizStep) => Promise<void>) {
  const inner = localQuizRepository(null);
  const steps: QuizStep[] = [];
  const repo: QuizRepository = {
    load: inner.load,
    openRounds: inner.openRounds,
    save: async (s) => {
      steps.push(structuredClone(s));
      await (save ? save(s) : inner.save(s));
    },
  };
  return { repo, steps };
}

const options = () => within(screen.getByRole('list', { name: 'Alternativas' }));
const option = (name: RegExp) => options().getByRole('button', { name });
const question = (name: string) => screen.findByRole('heading', { level: 2, name });
const start = async () => userEvent.click(await screen.findByRole('button', { name: 'Comenzar' }));
const answered = () => screen.getByRole('button', { name: /^(Siguiente|Ver resultado)$/ });

describe('the page', () => {
  it("sets the test's colors for light and dark on its frame", async () => {
    const { container } = renderApp(`${BASE}/pautas`);
    await start();
    const frame = container.querySelector('.quiz')!;
    expect(frame).toHaveClass('quiz', 'pb-4');
    const style = frame.getAttribute('style')!;
    for (const t of ['ac', 'ac-b', 'ac2', 'ac2-b', 'on-ac', 'g1', 'g2', 'g3']) {
      expect(style).toContain(`--t-${t}-l: #1F6F75;`);
      expect(style).toContain(`--t-${t}-d: #6CC3C8;`);
    }
    expect(style.indexOf('--t-ac-l')).toBeLessThan(style.indexOf('--t-ac-d'));
    expect(style.indexOf('--t-ac-d')).toBeLessThan(style.indexOf('--t-ac-b-l'));
  });

  it('the cover: kicker, crumbs to the assessment, the footer and «Tests» as its only test', async () => {
    renderApp(`${BASE}/pautas`);
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Tests');
    expect(screen.getByText('Certamen 2 · Biología celular')).toHaveClass('kicker');
    expect(screen.getByText('Test de práctica · 4 preguntas')).toBeInTheDocument();
    const crumbs = screen.getByRole('navigation', { name: 'Ruta' });
    expect(
      within(crumbs)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Inicio', '2° Semestre', 'Biología celular', 'Certamen 2', 'Tests']);
    expect(within(crumbs).getByRole('link', { name: 'Certamen 2' })).toHaveAttribute(
      'href',
      `${COURSE}#certamen-2`,
    );
    expect(screen.getByText('Pie del test')).toHaveClass('wrap', 'wide', 'qz-foot');
    expect(screen.getByText('Las 3 preguntas de alternativas.')).toBeInTheDocument();
  });

  it('a test without its tab in the URL, or with another semester, goes to its own address', async () => {
    const { router } = renderApp(
      `/semesters/1/courses/biologia-celular/tests/certamen-2/practica/nuevas`,
    );
    await waitFor(() => expect(router.state.location.pathname).toBe(`${BASE}/nuevas`));
    expect(await screen.findByRole('tab', { name: /Preguntas nuevas/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('a test with a single tab has no tab in its address', async () => {
    const one = { ...QUIZ, sections: [QUIZ.sections[0]!] };
    const api = fakeApi({ quiz: async () => one });
    const { router } = renderApp(`${BASE}/pautas`, { api });
    await waitFor(() => expect(router.state.location.pathname).toBe(BASE));
    expect(await screen.findByRole('button', { name: 'Comenzar' })).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('a test that does not load shows the error and «Reintentar» asks again', async () => {
    let calls = 0;
    const base = fakeApi();
    const api = fakeApi({
      quiz: async (id, signal) => {
        calls++;
        if (calls === 1) throw new ApiRequestError(500, 'internal', 'Algo falló.');
        return base.quiz(id, signal);
      },
    });
    renderApp(`${BASE}/pautas`, { api });
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('button', { name: 'Comenzar' })).toBeInTheDocument();
    expect(calls).toBe(2);
  });

  it('a slug that is not in the assessment: not found', async () => {
    renderApp(`${COURSE}/tests/certamen-2/otro/pautas`);
    expect(
      await screen.findByRole('heading', { name: /no aparece ni en el Netter/ }),
    ).toBeInTheDocument();
  });
});

describe('the tab', () => {
  it('is remembered when chosen, and opens next time', async () => {
    const user = userEvent.setup();
    const first = renderApp(`${BASE}/pautas`);
    await user.click(await screen.findByRole('tab', { name: /Preguntas nuevas/ }));
    expect(localStorage.getItem('qv-quiz-tab:practica-biocel')).toBe('nuevas');
    first.unmount();
    const { router } = renderApp(BASE);
    await waitFor(() => expect(router.state.location.pathname).toBe(`${BASE}/nuevas`));
  });

  it('without one remembered, the last one saved opens', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const storage = memoryStorage();
    const quiz = localQuizRepository(storage);
    vi.setSystemTime(new Date('2026-11-10T12:00:00Z'));
    await quiz.save({
      quizId: QUIZ.id,
      sectionId: 'pautas',
      preferences: { groups: ['01'] },
      round: null,
    });
    vi.setSystemTime(new Date('2026-11-10T12:05:00Z'));
    await quiz.save({
      quizId: QUIZ.id,
      sectionId: 'nuevas',
      preferences: { groups: ['01'] },
      round: null,
    });
    const { router } = renderApp(BASE, { quiz });
    await waitFor(() => expect(router.state.location.pathname).toBe(`${BASE}/nuevas`));
  });

  it('the arrows move between tabs, around the ends, and the new one takes the focus', async () => {
    const user = userEvent.setup();
    const { router } = renderApp(`${BASE}/pautas`);
    const first = await screen.findByRole('tab', { name: /Pautas de años pasados/ });
    expect(first).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: /Preguntas nuevas/ })).toHaveAttribute('tabindex', '-1');
    first.focus();
    await user.keyboard('{ArrowLeft}');
    await waitFor(() => expect(router.state.location.pathname).toBe(`${BASE}/nuevas`));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('tab', { name: /Preguntas nuevas/ })),
    );
    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(router.state.location.pathname).toBe(`${BASE}/pautas`));
    expect(router.state.location.state).toEqual({ fromTab: true });
    expect(localStorage.getItem('qv-quiz-tab:practica-biocel')).toBe('pautas');
  });
});

describe('the topics of a link', () => {
  it('are chosen once, for their own tab, and leave the address', async () => {
    const user = userEvent.setup();
    const { router } = renderApp(`${BASE}/pautas?topics=02&x=1#arriba`);
    expect(await screen.findByText('1 pregunta en total')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Transcripción/ })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: /Núcleo/ })).toBeChecked();
    await waitFor(() => expect(router.state.location.search).toBe('?x=1'));
    expect(router.state.location.hash).toBe('#arriba');
    await user.click(screen.getByRole('tab', { name: /Preguntas nuevas/ }));
    await screen.findByText('Materia que no salía');
    await user.click(screen.getByRole('tab', { name: /Pautas de años pasados/ }));
    expect(await screen.findByText('3 preguntas en total')).toBeInTheDocument();
  });

  it('bring the cover back over a round in the middle', async () => {
    const storage = memoryStorage();
    const first = renderApp(`${BASE}/pautas`, { quiz: localQuizRepository(storage) });
    await start();
    await userEvent.click(option(/Splicing alternativo/));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    first.unmount();
    renderApp(
      { pathname: `${BASE}/pautas`, search: '?topics=02', state: { inRound: true } } as {
        pathname: string;
        state: unknown;
      },
      { quiz: localQuizRepository(storage) },
    );
    const banner = await screen.findByRole('region', { name: 'Ronda a medias' });
    expect(banner).toHaveTextContent('Tienes una ronda a medias');
    expect(banner).toHaveTextContent('Vas en la pregunta 1 de 3 · 1 buena y 0 malas');
    expect(screen.getByText('1 pregunta en total')).toBeInTheDocument();
  });
});

describe('the cover', () => {
  it('the mode and the topics go with «Comenzar», and the round starts in the history', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.3);
    const user = userEvent.setup();
    const { repo, steps } = recording();
    const { router } = renderApp(`${BASE}/pautas`, { quiz: repo });
    const shuffle = await screen.findByRole('switch', { name: 'Mezclar orden de preguntas' });
    expect(shuffle.closest('label')).toHaveAttribute(
      'title',
      'Apagado: salen en el orden original, útil para reconocerlas.',
    );
    expect(
      screen.getByRole('switch', { name: 'Mezclar orden de alternativas' }).closest('label'),
    ).toHaveAttribute('title', 'Evita memorizar la posición de la correcta.');
    expect(screen.getByRole('group', { name: 'Modo' })).toBeInTheDocument();
    await user.click(shuffle);
    await user.click(screen.getByRole('switch', { name: 'Mezclar orden de alternativas' }));
    expect(steps).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Comenzar' }));
    await waitFor(() => expect(steps.length).toBe(1));
    expect(steps[0]!.preferences).toEqual({
      groups: ['01', '02'],
      shuffle: true,
      shuffleOptions: true,
    });
    expect(steps[0]!.roundInfo).toMatchObject({ shuffled: true, shuffleOptions: true });
    await waitFor(() =>
      expect(router.state.location.state).toEqual({ fromTab: false, inRound: true }),
    );
    // With the alternatives mixed, «1» is the first on screen.
    const first = options().getAllByRole('button')[0]!;
    const text = first.querySelector('.otx')!.textContent;
    await user.keyboard('1');
    await waitFor(() => expect(steps.some((s) => s.answer)).toBe(true));
    const step = steps.find((s) => s.answer)!;
    const prompt = screen.getByRole('heading', { level: 2 }).textContent;
    const all: Record<string, string[]> = {
      '¿Qué muestra el gel?': ['Splicing alternativo', 'Nada', 'Otra cosa'],
      '¿Dónde se une TBP?': ['A la caja TATA', 'Al ribosoma'],
      '¿Qué es la lámina?': ['Filamentos intermedios', 'Microtúbulos'],
    };
    expect(all[prompt]![step.answer!.chosen!]).toBe(text);
  });

  it('«Descartar» asks once more, for four seconds', async () => {
    const storage = memoryStorage();
    const { repo, steps } = recording((s) => localQuizRepository(storage).save(s));
    repo.load = localQuizRepository(storage).load;
    const first = renderApp(`${BASE}/pautas`, { quiz: repo });
    await start();
    await userEvent.click(option(/Splicing alternativo/));
    await userEvent.click(
      screen.getByRole('button', { name: 'Volver a Biología celular · Certamen 2' }),
    );
    const banner = await screen.findByRole('region', { name: 'Ronda a medias' });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.click(within(banner).getByRole('button', { name: 'Descartar' }));
    expect(within(banner).getByRole('button', { name: '¿Seguro? Descartar' })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3999);
    });
    expect(within(banner).getByRole('button', { name: '¿Seguro? Descartar' })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(within(banner).getByRole('button', { name: 'Descartar' })).toBeInTheDocument();
    fireEvent.click(within(banner).getByRole('button', { name: 'Descartar' }));
    fireEvent.click(within(banner).getByRole('button', { name: '¿Seguro? Descartar' }));
    expect(screen.queryByRole('region', { name: 'Ronda a medias' })).toBeNull();
    vi.useRealTimers();
    await waitFor(() => expect(steps.at(-1)?.round).toBeNull());
    expect(steps.at(-1)).toEqual({ quizId: QUIZ.id, sectionId: 'pautas', round: null });
    first.unmount();
  });

  it('the list of a tab opens with its sublists', async () => {
    renderApp(`${BASE}/nuevas`);
    const summary = await screen.findByText('Materia que no salía');
    const list = summary.closest('details')!;
    expect(list).toHaveClass('listado');
    expect(within(list).getByText('Tema suelto')).toBeInTheDocument();
    expect(within(list).getByText('Clase 8').closest('li')).toHaveClass('lsub');
    expect(within(list).getByText('Hebra molde')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Qué clases practicar' })).toBeNull();
    expect(screen.getByText('1 pregunta en total')).toBeInTheDocument();
  });
});

describe('the bar while answering', () => {
  it('counts, the progress, «Terminar» and «Reiniciar» with its dialog', async () => {
    const user = userEvent.setup();
    const { container } = renderApp(`${BASE}/pautas`);
    await start();
    await question('¿Qué muestra el gel?');
    const bar = container.querySelector('.qz-bar')!;
    expect(within(bar as HTMLElement).getByLabelText('Pregunta actual')).toHaveTextContent('1 / 3');
    expect(bar.querySelector('.pb i')).toHaveAttribute('style', 'width: 0%;');
    await user.click(option(/Nada/));
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    await question('¿Dónde se une TBP?');
    expect(bar.querySelector('.pb i')!.getAttribute('style')).toBe(`width: ${(1 / 3) * 100}%;`);
    expect(screen.getByLabelText('0 buenas y 1 malas')).toHaveTextContent('✓ 0✗ 1');
    const finish = screen.getByRole('button', { name: 'Terminar ahora' });
    expect(finish).toHaveAttribute('title', 'Terminar ahora y ver el resultado de las respondidas');
    const restart = screen.getByRole('button', { name: 'Reiniciar la ronda' });
    expect(restart).toHaveAttribute('title', 'Reiniciar la ronda');

    await user.click(restart);
    const dialog = screen.getByRole('alertdialog', { name: '¿Reiniciar la ronda?' });
    expect(dialog).toHaveAccessibleDescription(
      'Vuelves a la primera pregunta de esta ronda y se borran sus respuestas.',
    );
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Reiniciar' }));
    await user.keyboard('1');
    expect(answered()).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.activeElement).toBe(restart);
    await user.click(restart);
    await user.click(container.querySelector('.quiz-dlg-velo')!);
    expect(screen.queryByRole('alertdialog')).toBeNull();

    await user.click(finish);
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Hay que repasar');
    expect(document.querySelector('.res .res-line')).toHaveTextContent(
      'Pautas de años pasados · 1 de 3 respondidas',
    );
  });

  it('answering hides the menu of the site and scrolls to the top on each question', async () => {
    const scroll = vi.spyOn(window, 'scrollTo');
    renderApp(`${BASE}/pautas`);
    await start();
    await question('¿Qué muestra el gel?');
    const before = scroll.mock.calls.length;
    await userEvent.click(option(/Splicing alternativo/));
    expect(scroll.mock.calls.length).toBe(before);
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await question('¿Dónde se une TBP?');
    expect(scroll.mock.calls.length).toBe(before + 1);
    expect(scroll).toHaveBeenLastCalledWith(0, 0);
  });
});

describe('the keys', () => {
  it('numbers answer in screen order, only without modifiers, and once', async () => {
    const user = userEvent.setup();
    const { repo, steps } = recording();
    renderApp(`${BASE}/pautas`, { quiz: repo });
    await start();
    await question('¿Qué muestra el gel?');
    await user.keyboard('{Control>}1{/Control}');
    await user.keyboard('{Meta>}1{/Meta}');
    await user.keyboard('{Alt>}1{/Alt}');
    await user.keyboard('4');
    await user.keyboard(' ');
    expect(answered()).toBeDisabled();
    await user.keyboard('2');
    expect(screen.getByText('Incorrecta. La correcta es la A')).toBeInTheDocument();
    await user.keyboard('1');
    await waitFor(() => expect(steps.filter((s) => s.answer)).toHaveLength(1));
    expect(steps.find((s) => s.answer)!.answer!.chosen).toBe(1);
  });

  it('after answering «Siguiente» has the focus; the next question takes it when it is lost', async () => {
    const user = userEvent.setup();
    renderApp(`${BASE}/pautas`);
    await start();
    await question('¿Qué muestra el gel?');
    await user.keyboard('1');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Siguiente' }));
    await user.keyboard('{Enter}');
    await question('¿Dónde se une TBP?');
    const active = document.activeElement as HTMLElement;
    expect(active).toHaveClass('preg');
    expect(active).toHaveAttribute('tabindex', '-1');
  });

  it('before answering, Enter on a button is that button’s', async () => {
    const user = userEvent.setup();
    renderApp(`${BASE}/pautas`);
    await start();
    await question('¿Qué muestra el gel?');
    screen.getByRole('button', { name: 'Saltar' }).focus();
    await user.keyboard('{Enter}');
    await question('¿Dónde se une TBP?');
    expect(screen.getByLabelText('Pregunta actual')).toHaveTextContent('1 / 3');
    expect(screen.getByRole('button', { name: 'Saltar' })).toHaveAttribute(
      'title',
      'Dejarla para el final de la ronda',
    );
  });

  it('a zoomed image or a report open: the keys are theirs', async () => {
    const user = userEvent.setup();
    renderApp(`${BASE}/pautas`);
    await start();
    await question('¿Qué muestra el gel?');
    await user.keyboard('s');
    await question('¿Dónde se une TBP?');
    await user.keyboard('s');
    await question('¿Qué es la lámina?');
    await user.click(screen.getByRole('button', { name: 'Ampliar la imagen: Micrografía' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.keyboard('1');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(answered()).toBeDisabled();
    await user.keyboard('1');
    expect(screen.getByText('Correcta')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reportar error' }));
    await screen.findByRole('dialog', { name: 'Reportar error' });
    const position = screen.getByLabelText('Pregunta actual').textContent;
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('Pregunta actual')).toHaveTextContent(position);
  });

  it('a short answer: Enter shows it, then 1 says you knew it and Enter goes on', async () => {
    const user = userEvent.setup();
    renderApp(`${BASE}/nuevas`);
    await start();
    await question('¿Qué hebra se copia?');
    expect(screen.getByText(/ver respuesta/, { selector: '.atajo' })).toHaveTextContent(
      'Atajos: Espacio ver respuesta · 1 la sabía · 2 no · Enter siguiente · S saltar',
    );
    await user.keyboard('1');
    expect(screen.queryByText('La molde')).toBeNull();
    await user.keyboard('{Enter}');
    expect(screen.getByText('La molde').closest('.resp')).toHaveTextContent('RespuestaLa molde');
    expect(screen.queryByRole('button', { name: 'Mostrar respuesta' })).toBeNull();
    await user.keyboard('3');
    await user.keyboard('1');
    expect(screen.getByRole('status')).toHaveTextContent('✓La sabías');
    expect(screen.queryByRole('button', { name: '✓ La sabía' })).toBeNull();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      'Muy bien preparado',
    );
    expect(
      screen.getByText('Sin errores. Todas las respuestas fueron correctas.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Repetir solo las malas' })).toBeNull();
  });
});

describe('a question', () => {
  it('the alternatives, the verdict and the explanations as they are on screen', async () => {
    const user = userEvent.setup();
    renderApp(`${BASE}/pautas`);
    await start();
    await question('¿Qué muestra el gel?');
    expect(screen.getByText('Un gel de RT-PCR.')).toHaveClass('enun');
    expect(screen.getByText('Pauta original')).toHaveClass('tag', 'tsec', 's0');
    expect(screen.getByText('Transcripción')).toHaveClass('tag');
    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(screen.getByRole('status')).not.toHaveClass('veredicto');
    expect(screen.getByRole('button', { name: 'Saltar' })).not.toHaveAttribute('aria-hidden');
    await user.click(option(/Nada/));
    const all = options().getAllByRole('button');
    expect(all.map((b) => b.className)).toEqual(['opt buena', 'opt mala', 'opt tenue']);
    expect(all.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
    expect(all[0]).toHaveTextContent('ASplicing alternativo · la correcta');
    expect(all[1]).toHaveTextContent('BNada · tu respuesta, incorrecta');
    const verdict = screen.getByRole('status');
    expect(verdict).toHaveClass('veredicto', 'mal');
    expect(verdict.parentElement).toHaveClass('vfila');
    const skip = document.querySelector<HTMLButtonElement>('.pacc .btn2')!;
    expect(skip).toHaveTextContent('Saltar');
    expect(skip).toHaveAttribute('aria-hidden', 'true');
    expect(skip).toHaveStyle({ visibility: 'hidden' });
    expect(skip).toHaveAttribute('tabindex', '-1');
    const why = screen.getByText('Por qué cada alternativa').closest('.exp')!;
    const items = within(why as HTMLElement).getAllByRole('listitem');
    expect(items.map((li) => li.className)).toEqual(['xa-ok', 'xa-mal', '']);
    expect(items[0]).toHaveTextContent('A(la correcta) Verdadera. Dos tamaños.');
    expect(screen.getByText('Idea clave').nextElementSibling).toHaveTextContent('La idea clave.');
  });

  it('figures beside, a common caption, statements, a table with its title and a short answer explained', async () => {
    const section: QuizSectionDetail = {
      quizId: QUIZ.id,
      sectionId: 'pautas',
      groups: [
        {
          id: '01',
          name: 'Transcripción',
          questions: [
            {
              id: 'Q-1',
              kind: 'choice',
              context: 'Un contexto.<br>I. Primera.<br>II. Segunda.<br>Después.',
              prompt: 'Respecto de esto, es correcto:<br>I. Una.<br>II. Otra.',
              options: ['Sólo I', 'Sólo II'],
              correct: 0,
              figures: [
                {
                  kind: 'image',
                  media: 'tests/a.webp',
                  src: '/api/media/tests/a.webp',
                  width: 400,
                  height: 300,
                  alt: 'Foto A',
                  displayWidth: 200,
                  caption: 'Recreada.',
                },
                {
                  kind: 'svg',
                  svg: '<svg viewBox="0 0 4 4" role="img" aria-label="Esquema B"><rect width="4" height="4" fill="var(--g2)"/></svg>',
                  caption: 'Recreada.',
                },
              ],
              figureBeside: true,
              fixedOrder: true,
              explanation: 'Sin explicación por alternativa.',
            },
            {
              id: 'Q-2',
              kind: 'choice',
              prompt: '¿Qué dice la tabla?',
              options: ['Algo', 'Nada'],
              correct: 0,
              table: {
                title: 'Tabla <i>uno</i>',
                rows: [
                  [
                    { html: '', header: true, empty: true },
                    { html: 'Columna', header: true, colSpan: 2 },
                  ],
                  [
                    { html: 'Fila', header: true },
                    { html: '1', header: false },
                    { html: '2', header: false, highlight: true },
                  ],
                ],
              },
              figures: [
                {
                  kind: 'svg',
                  svg: '<svg viewBox="0 0 4 4" role="img" aria-label="Esquema C"><rect width="4" height="4" fill="var(--g1)"/></svg>',
                  caption: 'Solo esta.',
                },
                {
                  kind: 'image',
                  media: 'tests/d.webp',
                  src: '/api/media/tests/d.webp',
                  width: 30,
                  height: 20,
                  alt: '',
                },
              ],
              figureBeside: false,
              fixedOrder: false,
            },
            {
              id: 'Q-3',
              kind: 'short',
              prompt: '¿Y esto?',
              answer: 'Aquello',
              explanation: 'Porque sí.',
              figures: [],
              figureBeside: false,
            },
          ],
        },
      ],
    };
    const base = fakeApi();
    const api = fakeApi({
      quizSection: async (id, s, signal) =>
        s === 'pautas' ? section : base.quizSection(id, s, signal),
    });
    const user = userEvent.setup();
    const { container } = renderApp(`${BASE}/pautas`, { api });
    await start();
    await screen.findAllByRole('list', { name: 'Afirmaciones' });
    const lists = screen.getAllByRole('list', { name: 'Afirmaciones' });
    expect(lists).toHaveLength(2);
    expect(lists[0]!.previousElementSibling).toHaveClass('enun');
    expect(lists[0]!.nextElementSibling).toHaveTextContent('Después.');
    expect(lists[0]!.nextElementSibling!.tagName).toBe('P');
    expect(
      within(lists[1]!)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['I.Una.', 'II.Otra.']);
    expect(lists[1]!.previousElementSibling!.tagName).toBe('H2');
    const beside = container.querySelector('.conlado')!;
    expect(beside).toHaveAttribute('style', '--fw: min(200px, 58%);');
    expect(beside.firstElementChild).toHaveClass('figura', 'lado');
    expect(beside.lastElementChild).toHaveClass('opts');
    expect(within(beside as HTMLElement).getByText('Toca la imagen para ampliarla')).toHaveClass(
      'zhint',
    );
    const photo = screen.getByRole('img', { name: 'Foto A' });
    expect(photo).toHaveAttribute('width', '200');
    expect(photo).toHaveAttribute('height', '150');
    expect(photo).toHaveAttribute('loading', 'lazy');
    expect(screen.getByText('Recreada.')).toHaveClass('fpie', 'todo');
    expect(container.querySelectorAll('.fcon')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Ampliar la imagen: Foto A' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Recreada.');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(option(/Sólo II/));
    expect(screen.getByText('Explicación').nextElementSibling).toHaveTextContent(
      'Sin explicación por alternativa.',
    );
    expect(screen.queryByText('Por qué cada alternativa')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));

    await question('¿Qué dice la tabla?');
    expect(container.querySelector('.figura:not(.lado)')).not.toBeNull();
    expect(screen.getByText('Solo esta.').closest('.fcon')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Ampliar la imagen' })).toBeInTheDocument();
    expect(screen.getByText('uno').closest('.tcap')).toHaveTextContent('Tabla uno');
    const table = container.querySelector('.tablabox table')!;
    const cells = [...table.querySelectorAll('th, td')];
    expect(
      cells.map((c) => `${c.tagName}:${c.className}:${c.getAttribute('colspan') ?? ''}`),
    ).toEqual(['TH:vacia:', 'TH::2', 'TH::', 'TD::', 'TD:hl:']);
    await user.click(option(/Algo/));
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));

    await question('¿Y esto?');
    await user.click(screen.getByRole('button', { name: 'Mostrar respuesta' }));
    await user.click(screen.getByRole('button', { name: '✗ No la sabía' }));
    expect(screen.getByRole('status')).toHaveTextContent('✗Para repasar');
    expect(screen.getByText('Explicación').nextElementSibling).toHaveTextContent('Porque sí.');
    await user.click(screen.getByRole('button', { name: 'Ver resultado' }));
    const wrong = await screen.findByText('Para repasar (2)');
    const misses = wrong.parentElement!.querySelectorAll('.fallo');
    expect(misses).toHaveLength(2);
    expect(misses[0]!.querySelector('.fctx')).toHaveTextContent('Un contexto.');
    expect(misses[0]!.querySelectorAll('.afirm')).toHaveLength(2);
    expect(within(misses[1] as HTMLElement).getByText('Respuesta').tagName).toBe('DT');
    expect(misses[1]!.querySelector('dd.cb')).toHaveTextContent('Aquello');
    expect(misses[1]!.querySelector('.fx')).toHaveTextContent('Porque sí.');
  });

  it('with the alternatives mixed, the verdict names the right one by its letter on screen', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.3);
    const user = userEvent.setup();
    renderApp(`${BASE}/pautas`);
    await user.click(await screen.findByRole('switch', { name: 'Mezclar orden de alternativas' }));
    await start();
    await question('¿Qué muestra el gel?');
    const shown = () =>
      options()
        .getAllByRole('button')
        .map((b) => b.querySelector('.otx')!.textContent);
    expect(shown()).toEqual(['Nada', 'Otra cosa', 'Splicing alternativo']);
    await user.click(option(/Nada/));
    expect(screen.getByRole('status')).toHaveTextContent('Incorrecta. La correcta es la C');
    expect(option(/Splicing alternativo/)).toHaveTextContent('CSplicing alternativo · la correcta');
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    await question('¿Dónde se une TBP?');
    expect(shown()).toEqual(['Al ribosoma', 'A la caja TATA']);
    await user.click(option(/A la caja TATA/));
    expect(screen.getByRole('status')).toHaveTextContent('Correcta');
    expect(option(/A la caja TATA/)).toHaveTextContent('BA la caja TATA · tu respuesta, correcta');
  });

  it('a single figure with its caption keeps the caption under it', async () => {
    const section: QuizSectionDetail = {
      quizId: QUIZ.id,
      sectionId: 'pautas',
      groups: [
        {
          id: '01',
          name: 'Transcripción',
          questions: [
            {
              id: 'Q-1',
              kind: 'choice',
              prompt: '¿Y esta figura?',
              options: ['Una', 'Otra'],
              correct: 0,
              figures: [
                {
                  kind: 'svg',
                  svg: '<svg viewBox="0 0 4 4" role="img" aria-label="Esquema D"><rect width="4" height="4" fill="var(--g3)"/></svg>',
                  caption: 'Su pie.',
                },
              ],
              figureBeside: false,
              fixedOrder: true,
            },
          ],
        },
      ],
    };
    const base = fakeApi();
    const api = fakeApi({
      quizSection: async (id, s, signal) =>
        s === 'pautas' ? section : base.quizSection(id, s, signal),
    });
    renderApp(`${BASE}/pautas`, { api });
    await start();
    await question('¿Y esta figura?');
    const caption = screen.getByText('Su pie.');
    expect(caption).toHaveClass('fpie');
    expect(caption).not.toHaveClass('todo');
    expect(caption.closest('.fcon')!.firstElementChild).toHaveClass('fsvg');
  });
});

describe('the results', () => {
  it('the score, the wrong ones with their reasons, and the ways back', async () => {
    const user = userEvent.setup();
    const { router } = renderApp(`${BASE}/pautas`);
    await start();
    await user.click(option(/Nada/));
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    await question('¿Dónde se une TBP?');
    await user.click(option(/A la caja TATA/));
    await user.click(screen.getByRole('button', { name: 'Terminar ahora' }));
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Hay que repasar');
    expect(document.querySelector('.res .res-line')).toHaveTextContent(
      'Pautas de años pasados · 2 de 3 respondidas',
    );
    const cells = [...document.querySelectorAll('.marcador .mcell')].map((c) => [
      c.className,
      c.textContent,
    ]);
    expect(cells).toEqual([
      ['mcell g', '1buenas'],
      ['mcell r', '1malas'],
      ['mcell p', '50%correctas'],
    ]);
    const bar = screen.getByRole('img', { name: '50 % de respuestas correctas' });
    expect(bar.firstElementChild).toHaveAttribute('style', 'width: 50%;');
    const miss = screen.getByText('Para repasar (1)').nextElementSibling!;
    expect(miss).toHaveClass('fallo');
    expect(miss.querySelector('.fl')).toHaveTextContent(
      'Transcripción · pregunta 1 Reportar error',
    );
    expect(miss.querySelector('.fctx')).toHaveTextContent('Un gel de RT-PCR.');
    expect(miss.querySelector('.fpr')).toHaveTextContent('¿Qué muestra el gel?');
    expect(miss.querySelector('dd.cm')).toHaveTextContent('NadaFalsa. Hay bandas.');
    expect(miss.querySelector('dd.cb')).toHaveTextContent(
      'Splicing alternativoVerdadera. Dos tamaños.',
    );
    expect(miss.querySelector('.fx')).toHaveTextContent('La idea clave.');
    expect(screen.getByRole('link', { name: 'Volver al ramo' })).toHaveAttribute('href', COURSE);
    expect(screen.getByRole('navigation', { name: 'Ruta' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Volver al inicio' }));
    expect(await screen.findByRole('button', { name: 'Comenzar' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Ronda a medias' })).toBeNull();
    expect(router.state.location.pathname).toBe(`${BASE}/pautas`);
  });

  it('«Repetir todo» mixes the questions again when the mode says so', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.3);
    const user = userEvent.setup();
    const { repo, steps } = recording();
    renderApp(`${BASE}/pautas`, { quiz: repo });
    await user.click(await screen.findByRole('switch', { name: 'Mezclar orden de preguntas' }));
    await start();
    await screen.findByRole('heading', { level: 2 });
    await user.click(screen.getByRole('button', { name: 'Terminar ahora' }));
    await user.click(await screen.findByRole('button', { name: 'Repetir todo' }));
    await waitFor(() => expect(steps.at(-1)?.roundInfo?.origin).toBe('repeat_all'));
    expect(steps.at(-1)!.roundInfo).toMatchObject({ shuffled: true, shuffleOptions: false });
  });
});

describe('reporting a question', () => {
  it('from the question and from the results, with where it is', async () => {
    const user = userEvent.setup();
    const reports = localReportsRepository({ admin: true });
    const sent: NewReport[] = [];
    const send = reports.send.bind(reports);
    reports.send = (r) => {
      sent.push(r);
      return send(r);
    };
    renderApp(`${BASE}/pautas`, { reports });
    await start();
    await question('¿Qué muestra el gel?');
    expect(screen.queryByRole('button', { name: 'Reportar error' })).toBeNull();
    await user.click(option(/Nada/));
    await user.click(screen.getByRole('button', { name: 'Reportar error' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reportar error' });
    await user.type(within(dialog).getByLabelText('¿Qué está mal?'), 'Una falta');
    await user.click(within(dialog).getByRole('button', { name: 'Enviar' }));
    const thanks = await screen.findByText('Gracias: tu reporte le llegó al autor.');
    expect(thanks).toBeInTheDocument();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      kind: 'quiz_question',
      id: `${QUIZ.id}/D-p01-03`,
      code: null,
      version: null,
      location: {
        path: `${BASE}/pautas`,
        title: 'Práctica de Biocel · Transcripción · Pregunta 1',
        quizId: QUIZ.id,
        sectionId: 'pautas',
        number: 1,
      },
    });
    await waitFor(
      () => expect(screen.queryByText('Gracias: tu reporte le llegó al autor.')).toBeNull(),
      { timeout: 5000 },
    );

    await user.click(screen.getByRole('button', { name: 'Terminar ahora' }));
    await screen.findByText('Para repasar (1)');
    await user.click(screen.getByRole('button', { name: 'Reportar error' }));
    const again = await screen.findByRole('dialog', { name: 'Reportar error' });
    await user.type(within(again).getByLabelText('¿Qué está mal?'), 'Otra');
    await user.click(within(again).getByRole('button', { name: 'Enviar' }));
    await screen.findByText('Gracias: tu reporte le llegó al autor.');
    expect(sent[1]).toMatchObject({ id: `${QUIZ.id}/D-p01-03`, location: { number: 1 } });
  });
});

describe('saving', () => {
  it('a failed save says so after its retries, and «Reintentar» saves it', async () => {
    let fail = true;
    const { repo, steps } = recording(async () => {
      if (fail) throw new Error('sin conexión');
    });
    renderApp(`${BASE}/pautas`, { quiz: repo });
    await start();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No se pudo guardar tu avance. Revisa tu conexión.');
    expect(alert.parentElement).toHaveClass('wrap');
    expect(alert.parentElement).not.toHaveClass('wide');
    expect(steps).toHaveLength(3);
    fail = false;
    await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(steps).toHaveLength(4);
  });

  it('leaving the page while a step is saving asks first', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const { repo } = recording(() => gate);
    renderApp(`${BASE}/pautas`, { quiz: repo });
    await start();
    await question('¿Qué muestra el gel?');
    const leave = () => {
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(leave()).toBe(true);
    release();
    await waitFor(() => expect(leave()).toBe(false));
  });
});
