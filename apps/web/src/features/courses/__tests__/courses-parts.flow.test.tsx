// Characterizes the pages of the career, a semester, a course and an assessment's lists: what each line says, its
// links and the text nodes where a text follows an icon or a number.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Catalog, NoteSummary, QuizSummary } from '@qv/schema';
import { CATALOG, fakeApi, renderApp } from '../../../test/render';

const textNodes = (el: Node) => {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const out: string[] = [];
  while (walker.nextNode()) out.push(walker.currentNode.nodeValue ?? '');
  return out;
};

const BC = 'biologia-celular/certamen-2';

const note = (over: Partial<NoteSummary>): NoteSummary => ({
  id: 'AP-PR-01',
  slug: 'nota-de-prueba',
  courseId: 'biologia-celular',
  assessmentId: BC,
  kind: 'lecture',
  title: 'Nota de prueba',
  position: 9,
  updatedAt: '2026-10-30T12:00:00.000Z',
  ...over,
});

const quiz = (over: Partial<QuizSummary>): QuizSummary => ({
  id: 'otro-test',
  slug: 'otro',
  courseId: 'biologia-celular',
  assessmentId: BC,
  title: 'Otro test',
  position: 2,
  questionCount: 1234,
  sectionCount: 1,
  updatedAt: '2026-10-31T12:00:00.000Z',
  ...over,
});

/** The test catalog with more: a semester without courses, notes with their header, a second test and an empty assessment. */
function richCatalog(): Catalog {
  const c = structuredClone(CATALOG);
  const course = c.semesters[1]!.courses[0]!;
  const a = course.assessments[0]!;
  a.notes = [
    note({
      id: 'AP-PR-02',
      slug: 'base',
      title: 'Apunte base',
      header: { baseFor: '8', lecturer: 'Prof. Ejemplo', term: 'spring', year: 2026 },
      version: 3,
      versionAt: '2026-11-02T15:00:00.000Z',
    }),
    note({
      id: 'AP-PR-03',
      slug: 'clase-9',
      title: 'Clase nueve',
      subtitle: 'Con subtítulo',
      header: { number: '9', term: 'spring', year: 2025 },
      version: 1,
      versionAt: '2026-11-02T15:00:00.000Z',
    }),
    note({ id: 'AP-PR-04', slug: 'seminario', title: 'Un seminario', kind: 'seminar' }),
    note({ id: 'AP-PR-05', slug: 'practico', title: 'Un práctico', kind: 'practical' }),
  ];
  a.quizzes = [...a.quizzes, quiz({})];
  course.assessments.push({
    id: 'biologia-celular/certamen-3',
    courseId: 'biologia-celular',
    name: 'Certamen 3',
    position: 3,
    notes: [
      note({ id: 'AP-PR-06', slug: 'solo-nota', assessmentId: 'biologia-celular/certamen-3' }),
    ],
    quizzes: [],
    cardCount: 0,
  });
  c.semesters.push({ number: 3, name: '3° Semestre', courses: [] });
  c.hiddenSemesters = 4;
  return c;
}

const main = () => within(screen.getByRole('main'));

const api = () => fakeApi({ catalog: async () => richCatalog() });

describe('the career', () => {
  it('groups the semesters by year, says what each has and that more are coming', async () => {
    renderApp('/courses', { api: api() });
    expect(
      await within(await screen.findByRole('main')).findByRole('heading', {
        level: 2,
        name: 'Primer año',
      }),
    ).toBeInTheDocument();
    expect(main().getByRole('heading', { level: 2, name: 'Segundo año' })).toBeInTheDocument();
    const second = main().getByRole('link', { name: /2° Semestre/ });
    expect(within(second).getByText('🧬 Biología celular')).toBeInTheDocument();
    expect(within(second).getByText('5 apuntes')).toBeInTheDocument();
    expect(textNodes(within(second).getAllByRole('listitem')[0]!)).toEqual([
      '🧬',
      ' ',
      'Biología celular',
    ]);
    expect(
      within(main().getByRole('link', { name: /1° Semestre/ })).getByText('1 mazo'),
    ).toBeInTheDocument();
    expect(main().getByText('3° Semestre').nextSibling).toHaveTextContent('Pronto.');
    expect(main().getByText('Los próximos semestres vienen pronto.')).toBeInTheDocument();
    expect(textNodes(main().getByRole('heading', { name: 'Primer año' }))).toEqual([
      'Primer',
      ' año',
    ]);
  });

  it('a semester with courses but no material says the notes are on their way', async () => {
    const c = structuredClone(CATALOG);
    c.semesters[1]!.courses = [c.semesters[1]!.courses[1]!];
    renderApp('/courses', { api: fakeApi({ catalog: async () => c }) });
    const link = await within(await screen.findByRole('main')).findByRole('link', {
      name: /2° Semestre/,
    });
    expect(within(link).getByText('Apuntes en camino')).toBeInTheDocument();
  });
});

describe('a semester', () => {
  it('without courses says so', async () => {
    renderApp('/semesters/3', { api: api() });
    expect(
      await within(await screen.findByRole('main')).findByText(
        'Todavía no hay ramos de este semestre.',
      ),
    ).toBeInTheDocument();
    expect(main().getByRole('heading', { level: 1 })).toHaveTextContent('3° Semestre');
  });

  it('links the courses with material, with their assessments, and not the others', async () => {
    renderApp('/semesters/2', { api: api() });
    const link = await within(await screen.findByRole('main')).findByRole('link', {
      name: /Biología celular/,
    });
    expect(within(link).getByText('5 apuntes · Certamen 2, Certamen 3')).toBeInTheDocument();
    expect(main().queryByRole('link', { name: /Física/ })).toBeNull();
    expect(main().getByText('Física').nextSibling).toHaveTextContent('Próximamente');
  });
});

describe('a course', () => {
  it('says its material and gives each assessment its cards', async () => {
    renderApp('/semesters/2/courses/biologia-celular', { api: api() });
    expect(
      await within(await screen.findByRole('main')).findByText('5 apuntes · 2 tests'),
    ).toBeInTheDocument();
    expect(textNodes(main().getByRole('heading', { level: 1 }))).toEqual([
      '🧬',
      ' ',
      'Biología celular',
    ]);
    const c2 = main().getByRole('region', { name: 'Certamen 2' });
    const notes = within(c2).getByRole('link', { name: /^Apuntes/ });
    expect(notes).toHaveAttribute(
      'href',
      `/semesters/2/courses/biologia-celular/assessments/certamen-2/notes`,
    );
    expect(within(notes).getByText('2 clases · 1 seminario · 1 otro')).toBeInTheDocument();
    const tests = within(c2).getByRole('link', { name: /^Tests/ });
    expect(tests).toHaveAttribute(
      'href',
      `/semesters/2/courses/biologia-celular/assessments/certamen-2/tests`,
    );
    expect(textNodes(within(tests).getByText(/preguntas/))).toEqual([
      '2 tests · ',
      '1.238 preguntas',
    ]);
    const c3 = main().getByRole('region', { name: 'Certamen 3' });
    expect(within(c3).getByText('1 clase')).toBeInTheDocument();
    expect(within(c3).queryByRole('link', { name: /^Tests/ })).toBeNull();
    expect(main().queryByRole('link', { name: /Todos los mazos del ramo/ })).toBeNull();
  });

  it('a single test goes straight to it, with its title', async () => {
    renderApp('/semesters/2/courses/biologia-celular');
    const tests = await within(await screen.findByRole('main')).findByRole('link', {
      name: /^Tests/,
    });
    expect(tests).toHaveAttribute(
      'href',
      '/semesters/2/courses/biologia-celular/tests/certamen-2/practica',
    );
    expect(textNodes(within(tests).getByText(/preguntas/))).toEqual([
      'Práctica de Biocel · ',
      '4 preguntas',
    ]);
  });

  it('without material says so and offers the career', async () => {
    renderApp('/semesters/2/courses/fisica');
    expect(
      await within(await screen.findByRole('main')).findByText(
        'Todavía no hay material de este ramo.',
      ),
    ).toBeInTheDocument();
    expect(main().getByRole('link', { name: 'Ver toda la carrera' })).toHaveAttribute(
      'href',
      '/courses',
    );
  });

  it('the Anki card: its decks and cards, today and what is being studied', async () => {
    renderApp('/semesters/1/courses/anatomia-1');
    const card = await within(await screen.findByRole('main')).findByRole('link', {
      name: /^Anki/,
    });
    expect(textNodes(within(card).getByText(/tarjetas?$/))).toEqual([
      '1 mazo',
      ' ·',
      ' ',
      '4 tarjetas',
    ]);
    const today = await within(card).findByRole('group', { name: 'Hoy en Certamen 1' });
    expect(today).toBeInTheDocument();
    const units = await within(await screen.findByRole('main')).findByRole('button', {
      name: /Qué estás estudiando/,
    });
    expect(textNodes(units)).toEqual([
      'Qué estás estudiando · ',
      '1',
      ' de ',
      '1',
      ' ',
      'activada',
    ]);
    expect(units).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(units);
    expect(units).toHaveAttribute('aria-expanded', 'true');
    expect(
      main().getByRole('list', { name: 'Semanas y clases de Certamen 1' }),
    ).toBeInTheDocument();
    const all = main().getByRole('link', { name: /Todos los mazos del ramo/ });
    expect(textNodes(all)).toEqual([' Todos los mazos del ramo']);
    expect(textNodes(main().getByRole('link', { name: /Ver las tarjetas/ }))).toEqual([
      ' Ver las tarjetas',
    ]);
  });
});

describe('an assessment’s notes', () => {
  const path = '/semesters/2/courses/biologia-celular/assessments/certamen-2/notes';

  it('frames the list and gives each note its line and number', async () => {
    renderApp(path, { api: api() });
    expect(
      await within(await screen.findByRole('main')).findByRole('heading', {
        level: 1,
        name: 'Apuntes',
      }),
    ).toBeInTheDocument();
    expect(main().getByText('Biología celular · Certamen 2')).toBeInTheDocument();
    expect(main().getByRole('heading', { level: 2, name: 'Clases' })).toBeInTheDocument();
    expect(main().getByRole('heading', { level: 2, name: 'Seminarios' })).toBeInTheDocument();
    expect(main().getByRole('heading', { level: 2, name: 'Prácticos' })).toBeInTheDocument();
    const base = main().getByRole('link', { name: /Apunte base/ });
    expect(within(base).getByText('Base')).toBeInTheDocument();
    expect(
      within(base).getByText(
        'Apunte base para la clase 8 · Prof. Ejemplo · 2026 · Actualizado el 2 de noviembre de 2026',
      ),
    ).toBeInTheDocument();
    const nine = main().getByRole('link', { name: /Clase nueve/ });
    expect(textNodes(nine).slice(0, 3)).toEqual(['Clase', ' ', '9']);
    expect(within(nine).getByText('2025 · Con subtítulo')).toBeInTheDocument();
  });

  it('an assessment without notes says so and goes back to the course', async () => {
    renderApp('/semesters/1/courses/anatomia-1/assessments/certamen-1/notes');
    expect(
      await within(await screen.findByRole('main')).findByText(
        'Todavía no hay apuntes de este certamen.',
      ),
    ).toBeInTheDocument();
    expect(main().getByRole('link', { name: 'Volver a Anatomía I' })).toHaveAttribute(
      'href',
      '/semesters/1/courses/anatomia-1',
    );
    expect(textNodes(main().getByRole('link', { name: 'Volver a Anatomía I' }))).toEqual([
      'Volver a ',
      'Anatomía I',
    ]);
  });
});

describe('an assessment’s tests', () => {
  it('lists each test with its questions, sections and «Practicar»', async () => {
    renderApp('/semesters/2/courses/biologia-celular/assessments/certamen-2/tests', { api: api() });
    expect(
      await within(await screen.findByRole('main')).findByRole('heading', {
        level: 1,
        name: 'Tests',
      }),
    ).toBeInTheDocument();
    const items = main()
      .getAllByRole('link', { name: 'Practicar' })
      .map((l) => l.closest('li') as HTMLElement);
    expect(textNodes(within(items[0]!).getByText(/preguntas/))).toEqual([
      '4 preguntas',
      ' · 2 secciones',
    ]);
    expect(within(items[1]!).getByText('1.234 preguntas')).toBeInTheDocument();
    expect(within(items[1]!).getByRole('link', { name: 'Practicar' })).toHaveAttribute(
      'href',
      '/semesters/2/courses/biologia-celular/tests/certamen-2/otro',
    );
  });

  it('without tests, points to the notes if there are, or back to the course', async () => {
    const { unmount } = renderApp(
      '/semesters/2/courses/biologia-celular/assessments/certamen-3/tests',
      { api: api() },
    );
    expect(
      await within(await screen.findByRole('main')).findByText(
        'Todavía no hay tests de este certamen. Mientras, puedes repasar con sus apuntes.',
      ),
    ).toBeInTheDocument();
    expect(main().getByRole('link', { name: 'Ver los apuntes' })).toHaveAttribute(
      'href',
      '/semesters/2/courses/biologia-celular/assessments/certamen-3/notes',
    );
    unmount();
    renderApp('/semesters/1/courses/anatomia-1/assessments/certamen-1/tests');
    expect(
      await within(await screen.findByRole('main')).findByText(
        'Todavía no hay tests de este certamen.',
      ),
    ).toBeInTheDocument();
    expect(main().getByRole('link', { name: 'Volver a Anatomía I' })).toHaveAttribute(
      'href',
      '/semesters/1/courses/anatomia-1',
    );
  });
});

describe('the numbers and the links of the lists', () => {
  it('says «pregunta» for one and «preguntas» for none, for several and for thousands', async () => {
    renderApp('/semesters/2/courses/biologia-celular/assessments/certamen-2/tests', {
      api: fakeApi({
        catalog: async () => {
          const c = richCatalog();
          const a = c.semesters[1]!.courses[0]!.assessments[0]!;
          a.quizzes = [
            quiz({ id: 'q0', slug: 'cero', questionCount: 0 }),
            quiz({ id: 'q1', slug: 'una', questionCount: 1 }),
            quiz({ id: 'q2', slug: 'miles', questionCount: 12345 }),
          ];
          return c;
        },
      }),
    });
    await screen.findByRole('main');
    expect(await main().findByText('0 preguntas')).toBeInTheDocument();
    expect(main().getByText('1 pregunta')).toBeInTheDocument();
    expect(main().getByText('12.345 preguntas')).toBeInTheDocument();
  });

  it('a note with a deck and a test links them: the deck, and the test in its tab and topics', async () => {
    renderApp('/semesters/1/courses/anatomia-1/assessments/certamen-1/notes', {
      api: fakeApi({
        catalog: async () => {
          const c = structuredClone(CATALOG);
          const a = c.semesters[0]!.courses[0]!.assessments[0]!;
          a.quizzes = [
            quiz({
              id: 'practica-anato',
              slug: 'practica',
              courseId: 'anatomia-1',
              assessmentId: 'anatomia-1/certamen-1',
              sectionCount: 2,
            }),
          ];
          a.notes = [
            note({
              id: 'AP-AN-01',
              slug: 'columna',
              title: 'Columna',
              courseId: 'anatomia-1',
              assessmentId: 'anatomia-1/certamen-1',
              practice: {
                quizId: 'practica-anato',
                section: 'pautas',
                groups: ['01', '02'],
                deck: 'Mazo de prueba',
              },
            }),
          ];
          return c;
        },
      }),
    });
    await screen.findByRole('main');
    const test = await main().findByRole('link', { name: 'Test de Columna' });
    expect(test).toHaveAttribute(
      'href',
      '/semesters/1/courses/anatomia-1/tests/certamen-1/practica/pautas?topics=01%2C02',
    );
    expect(textNodes(test)).toEqual([' Test']);
    const deck = main().getByRole('link', { name: /^Anki de Columna/ });
    expect(deck).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/semesters\/1\/courses\/anatomia-1\/anki\/.*mazo-de-prueba$/),
    );
    expect(textNodes(deck)[0]).toBe(' Anki');
  });

  it('the pages of an assessment under another semester go to the right one', async () => {
    const { router } = renderApp(
      '/semesters/1/courses/biologia-celular/assessments/certamen-2/notes',
      { api: api() },
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/semesters/2/courses/biologia-celular/assessments/certamen-2/notes',
      ),
    );
    await main().findByRole('heading', { level: 1, name: 'Apuntes' });
  });

  it('and so do its tests', async () => {
    const { router } = renderApp(
      '/semesters/1/courses/biologia-celular/assessments/certamen-2/tests',
      { api: api() },
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/semesters/2/courses/biologia-celular/assessments/certamen-2/tests',
      ),
    );
    await main().findByRole('heading', { level: 1, name: 'Tests' });
  });
});
