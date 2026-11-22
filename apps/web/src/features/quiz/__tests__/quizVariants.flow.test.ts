// Practice tests unlike the usual one (one tab outside its assessment, several tests), and the rarer moments of a round:
// no errors, a short answer by click, statements alone, a save failing on the results, a report cancelled.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Catalog, QuizDetail } from '@qv/schema';
import { fakeApi } from '../../../test/fakes/api';
import { CATALOG } from '../../../test/fixtures/catalog';
import { QUIZ, QUIZ_SECTIONS } from '../../../test/fixtures/quiz';
import { renderApp } from '../../../test/render';
import { localQuizRepository } from '../api/repository';
import type { QuizRepository } from '../api/repository';

const COURSE = '/semesters/2/courses/biologia-celular';
const BASE = `${COURSE}/tests/certamen-2/practica`;

const start = async () => userEvent.click(await screen.findByRole('button', { name: 'Comenzar' }));
const options = () => within(screen.getByRole('list', { name: 'Alternativas' }));
const crumbs = () =>
  within(screen.getByRole('navigation', { name: 'Ruta' }))
    .getAllByRole('listitem')
    .map((li) => li.textContent);

/** The test with only its first tab, without its texts, as a test outside the assessment the catalog lists it in. */
const bare: QuizDetail = structuredClone({
  ...QUIZ,
  assessmentId: 'biologia-celular/otro',
  kicker: '',
  heading: '',
  footer: '',
  sections: [{ ...QUIZ.sections[0]!, description: '' }],
});
delete bare.sections[0]!.label;

function withTwoTests(): Catalog {
  const c = structuredClone(CATALOG);
  const a = c.semesters[1]!.courses[0]!.assessments[0]!;
  a.quizzes = [a.quizzes[0]!, { ...a.quizzes[0]!, id: 'otro', slug: 'otro', title: 'Otro test' }];
  return c;
}

describe('a single tab outside its assessment, without kicker, heading, description nor footer', () => {
  it('the cover is titled by the test, and its crumbs end in it without the assessment', async () => {
    renderApp(BASE, { api: fakeApi({ quiz: async () => bare }) });
    const title = await screen.findByRole('heading', { level: 1 });
    expect(title).toHaveTextContent(/^Práctica de Biocel$/);
    expect(crumbs()).toEqual(['Inicio', '2° Semestre', 'Biología celular', 'Práctica de Biocel']);
    expect(document.querySelector('.portada .kicker')).toBeNull();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByText('Las 3 preguntas de alternativas.')).toBeNull();
    expect(screen.queryByText('Pie del test')).toBeNull();
  });

  it('a round without errors: no «Repetir solo las malas», «Sin errores» and no tab in the results', async () => {
    const user = userEvent.setup();
    renderApp(BASE, { api: fakeApi({ quiz: async () => bare }) });
    await start();
    for (const right of [/Splicing alternativo/, /A la caja TATA/, /Filamentos intermedios/]) {
      await user.click(options().getByRole('button', { name: right }));
      await user.click(screen.getByRole('button', { name: /^(Siguiente|Ver resultado)$/ }));
    }
    expect(
      await screen.findByText('Sin errores. Todas las respuestas fueron correctas.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Repetir solo las malas' })).toBeNull();
    expect(document.querySelector('.res .kicker')).toHaveTextContent(/^3 de 3 respondidas$/);
  });

  it('a question of a tab without a label shows no tab’s tag', async () => {
    renderApp(BASE, { api: fakeApi({ quiz: async () => bare }) });
    await start();
    await screen.findByRole('heading', { level: 2, name: '¿Qué muestra el gel?' });
    expect(document.querySelector('.meta .tsec')).toBeNull();
    expect(screen.queryByText('Pauta original')).toBeNull();
  });
});

describe('an assessment with several tests', () => {
  it('the crumbs go through «Tests», and the cover takes the test’s own heading', async () => {
    renderApp(`${BASE}/pautas`, { api: fakeApi({ catalog: async () => withTwoTests() }) });
    const title = await screen.findByRole('heading', { level: 1 });
    expect(title).toHaveTextContent('Practica para el Certamen 2');
    expect(crumbs()).toEqual([
      'Inicio',
      '2° Semestre',
      'Biología celular',
      'Certamen 2',
      'Tests',
      'Práctica de Biocel',
    ]);
    expect(
      within(screen.getByRole('navigation', { name: 'Ruta' })).getByRole('link', { name: 'Tests' }),
    ).toHaveAttribute('href', `${COURSE}/assessments/certamen-2/tests`);
  });
});

describe('the cover’s tabs', () => {
  it('only the arrows move between tabs: another key leaves the tab as it is', async () => {
    const { router } = renderApp(`${BASE}/pautas`);
    const tab = await screen.findByRole('tab', { name: /Pautas de años pasados/ });
    tab.focus();
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('a');
    expect(router.state.location.pathname).toBe(`${BASE}/pautas`);
  });
});

describe('a short answer', () => {
  it('«La sabía», clicked, counts it as right', async () => {
    const user = userEvent.setup();
    renderApp(`${BASE}/nuevas`);
    await start();
    await user.click(await screen.findByRole('button', { name: 'Mostrar respuesta' }));
    await user.click(screen.getByRole('button', { name: '✓ La sabía' }));
    await user.click(screen.getByRole('button', { name: 'Ver resultado' }));
    expect(
      await screen.findByText('Sin errores. Todas las respuestas fueron correctas.'),
    ).toBeInTheDocument();
  });
});

describe('statements in a prompt', () => {
  it('a prompt of statements alone has no heading, and the text after them is a paragraph', async () => {
    const section = structuredClone(QUIZ_SECTIONS.pautas!);
    const [first, second] = section.groups[0]!.questions;
    delete first!.context;
    first!.prompt = 'I. Hay dos bandas<br>II. Hay una banda';
    second!.prompt = 'I. Une TATA<br>II. Une el ribosoma<br>¿Cuáles son ciertas?';
    renderApp(`${BASE}/pautas`, {
      api: fakeApi({
        quizSection: async (_id, id) => (id === 'pautas' ? section : QUIZ_SECTIONS[id]!),
      }),
    });
    await start();
    const list = await screen.findByRole('list', { name: 'Afirmaciones' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['I.Hay dos bandas', 'II.Hay una banda']);
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
    expect(document.activeElement).toBe(document.body);
    await userEvent.click(options().getByRole('button', { name: /Splicing alternativo/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    const after = await screen.findByText('¿Cuáles son ciertas?');
    expect(after.tagName).toBe('P');
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
  });
});

describe('the keys while answering', () => {
  it('Enter before answering a question of alternatives does nothing, and the browser does not get it', async () => {
    renderApp(`${BASE}/pautas`);
    await start();
    await screen.findByRole('heading', { level: 2, name: '¿Qué muestra el gel?' });
    (document.activeElement as HTMLElement | null)?.blur();
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    document.body.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });

  it('a digit typed in the search box does not answer', async () => {
    const user = userEvent.setup();
    renderApp(`${BASE}/pautas`);
    await start();
    await screen.findByRole('heading', { level: 2, name: '¿Qué muestra el gel?' });
    await user.click(screen.getByRole('button', { name: /Buscar en la página/ }));
    const box = await screen.findByRole('combobox');
    await user.type(box, '1');
    expect(box).toHaveValue('1');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull());
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });
});

describe('saving on the results', () => {
  it('a failed save there says so across the whole width', async () => {
    const user = userEvent.setup();
    const inner = localQuizRepository(null);
    let fail = false;
    const repo: QuizRepository = {
      ...inner,
      save: async (s) => {
        if (fail) throw new Error('sin conexión');
        await inner.save(s);
      },
    };
    renderApp(`${BASE}/pautas`, { quiz: repo });
    await start();
    await user.click(options().getByRole('button', { name: /Nada/ }));
    fail = true;
    await user.click(screen.getByRole('button', { name: 'Terminar ahora' }));
    const alert = await screen.findByRole('alert', {}, { timeout: 8000 });
    expect(alert.parentElement).toHaveClass('wrap', 'wide');
  });
});

describe('the report of a question', () => {
  it('«Cancelar» closes it without sending', async () => {
    const user = userEvent.setup();
    renderApp(`${BASE}/pautas`);
    await start();
    await user.click(options().getByRole('button', { name: /Nada/ }));
    await user.click(screen.getByRole('button', { name: 'Reportar error' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reportar error' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText('Gracias: tu reporte le llegó al autor.')).toBeNull();
  });
});

describe('a figure of a test', () => {
  it('an image without its address nor caption still opens the viewer', async () => {
    const user = userEvent.setup();
    const section = structuredClone(QUIZ_SECTIONS.pautas!);
    const figure = section.groups[1]!.questions[0]!.figures[0]!;
    if (figure.kind === 'image') delete figure.src;
    renderApp(`${BASE}/pautas`, {
      api: fakeApi({
        quizSection: async (_id, id) => (id === 'pautas' ? section : QUIZ_SECTIONS[id]!),
      }),
    });
    await start();
    for (const right of [/Splicing alternativo/, /A la caja TATA/]) {
      await user.click(options().getByRole('button', { name: right }));
      await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    }
    await user.click(await screen.findByRole('button', { name: /Micrografía/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
