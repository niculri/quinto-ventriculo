// Characterizes the site's menu: which assessments are open on each page, and that what was opened or closed by hand
// is forgotten on going to another page.
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Catalog } from '@qv/schema';
import { fakeApi } from '../../../test/fakes/api';
import { CATALOG } from '../../../test/fixtures/catalog';
import { renderApp } from '../../../test/render';

const COURSE = '/semesters/2/courses/biologia-celular';

/** The test catalog with a second assessment that has a note. */
function twoAssessments(): Catalog {
  const c = structuredClone(CATALOG);
  const course = c.semesters[1]!.courses[0]!;
  const first = course.assessments[0]!;
  course.assessments.push({
    id: 'biologia-celular/certamen-3',
    courseId: 'biologia-celular',
    name: 'Certamen 3',
    position: 3,
    notes: [
      {
        ...first.notes[0]!,
        id: 'AP-PR-30',
        slug: 'otra-clase',
        title: 'Otra clase',
        assessmentId: 'biologia-celular/certamen-3',
      },
    ],
    quizzes: [],
    cardCount: 0,
  });
  return c;
}

const api = () => fakeApi({ catalog: async () => twoAssessments() });
const menu = () => within(screen.getByRole('navigation', { name: 'Menú del sitio' }));
const toggle = (name: string) => menu().getByRole('button', { name });
const open = (name: string) => expect(toggle(name)).toHaveAttribute('aria-expanded', 'true');
const closed = (name: string) => expect(toggle(name)).toHaveAttribute('aria-expanded', 'false');
/** The menu has the assessments once the catalog is in. */
const ready = () => screen.findByRole('button', { name: 'Certamen 3' });

describe('the assessments of the menu', () => {
  it('on the course’s page all are open', async () => {
    renderApp(COURSE, { api: api() });
    await ready();
    open('Certamen 2');
    open('Certamen 3');
  });

  it('a course whose only material is a deck outside its assessments opens with none', async () => {
    const c = structuredClone(CATALOG);
    const deck = { ...c.anki.decks[0]!, semester: 2, noteCount: 1, cardCount: 1 };
    c.anki.decks.push(
      { ...deck, id: '30', name: '() Medicina UCH::2° Semestre', parentId: '1' },
      {
        ...deck,
        id: '31',
        name: '() Medicina UCH::2° Semestre::🧲 Física',
        parentId: '30',
        courseId: 'fisica',
      },
    );
    renderApp('/semesters/2/courses/fisica', { api: fakeApi({ catalog: async () => c }) });
    await waitFor(() =>
      expect(menu().getByRole('link', { name: /Física/ })).toHaveAttribute('aria-current', 'page'),
    );
    expect(menu().queryAllByRole('button')).toEqual([]);
  });

  it('on a note, the assessment being read is open and the other is closed', async () => {
    renderApp(`${COURSE}/notes/11-traduccion`, { api: api() });
    await ready();
    open('Certamen 2');
    closed('Certamen 3');
  });

  it('what is opened or closed by hand is forgotten on going to another page', async () => {
    const user = userEvent.setup();
    const { router } = renderApp(COURSE, { api: api() });
    await ready();
    await user.click(toggle('Certamen 2'));
    closed('Certamen 2');
    await act(() => router.navigate(`${COURSE}/notes/11-traduccion`));
    await ready();
    open('Certamen 2');
    closed('Certamen 3');
  });
});

describe('the tests of an assessment in the menu', () => {
  it('with one, a link; with several, a branch that marks the one being answered', async () => {
    const several = fakeApi({
      catalog: async () => {
        const c = structuredClone(CATALOG);
        const a = c.semesters[1]!.courses[0]!.assessments[0]!;
        a.quizzes = [
          a.quizzes[0]!,
          { ...a.quizzes[0]!, id: 'otro-test', slug: 'otro', title: 'Otro test', position: 2 },
        ];
        return c;
      },
    });
    renderApp(`${COURSE}/tests/certamen-2/otro`, { api: several });
    const branch = await screen.findByRole('button', { name: 'Tests' });
    expect(branch).toHaveAttribute('aria-expanded', 'true');
    expect(menu().getByRole('link', { name: 'Otro test' })).toHaveAttribute('aria-current', 'page');
    expect(menu().getByRole('link', { name: 'Práctica de Biocel' })).not.toHaveAttribute(
      'aria-current',
    );
  });
});

describe('the parts of an open assessment', () => {
  it('«Apuntes» opens on a note and closes and opens again by hand', async () => {
    const user = userEvent.setup();
    renderApp(`${COURSE}/notes/11-traduccion`);
    const notes = await screen.findByRole('button', { name: 'Apuntes' });
    expect(notes).toHaveAttribute('aria-expanded', 'true');
    expect(menu().getByRole('link', { name: 'Traducción' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await user.click(notes);
    expect(notes).toHaveAttribute('aria-expanded', 'false');
    expect(menu().queryByRole('link', { name: 'Traducción' })).toBeNull();
    await user.click(notes);
    expect(menu().getByRole('link', { name: 'Núcleo celular' })).toBeInTheDocument();
  });

  it('several tests are a branch closed away from them, that opens by hand', async () => {
    const user = userEvent.setup();
    const several = fakeApi({
      catalog: async () => {
        const c = structuredClone(CATALOG);
        const a = c.semesters[1]!.courses[0]!.assessments[0]!;
        a.quizzes = [
          a.quizzes[0]!,
          { ...a.quizzes[0]!, id: 'otro-test', slug: 'otro', title: 'Otro test' },
        ];
        return c;
      },
    });
    renderApp(`${COURSE}/notes/11-traduccion`, { api: several });
    const tests = await screen.findByRole('button', { name: 'Tests' });
    expect(tests).toHaveAttribute('aria-expanded', 'false');
    await user.click(tests);
    expect(menu().getByRole('link', { name: 'Otro test' })).not.toHaveAttribute('aria-current');
    await user.click(tests);
    expect(menu().queryByRole('link', { name: 'Otro test' })).toBeNull();
  });
});

/** Two assessments, the first one with its notes in two weeks (the second week with two notes). */
function inWeeks(): Catalog {
  const c = twoAssessments();
  const a = c.semesters[1]!.courses[0]!.assessments[0]!;
  const [nucleus, translation] = a.notes;
  a.notes = [
    { ...nucleus!, group: 'Semana 1' },
    { ...translation!, group: 'Semana 2' },
    { ...translation!, id: 'AP-PR-12', slug: '12-extra', title: 'Clase extra', group: 'Semana 2' },
  ];
  return c;
}

describe('the weeks of an assessment in the menu', () => {
  const weeks = () => fakeApi({ catalog: async () => inWeeks() });
  const link = (name: string) => menu().queryByRole('link', { name });

  it('on a note only its week is open, and the others show their name and nothing more', async () => {
    renderApp(`${COURSE}/notes/11-traduccion`, { api: weeks() });
    await ready();
    open('Semana 2');
    closed('Semana 1');
    expect(link('Traducción')).toHaveAttribute('aria-current', 'page');
    expect(link('Clase extra')).toBeInTheDocument();
    expect(link('Núcleo celular')).toBeNull();
  });

  it('in the list of notes, all of them are closed', async () => {
    renderApp(`${COURSE}/assessments/certamen-2/notes`, { api: weeks() });
    await ready();
    open('Apuntes');
    closed('Semana 1');
    closed('Semana 2');
  });

  it('what is opened or closed by hand stays in the same assessment and is forgotten in another one', async () => {
    const user = userEvent.setup();
    const { router } = renderApp(`${COURSE}/notes/11-traduccion`, { api: weeks() });
    await ready();
    await user.click(toggle('Semana 1'));
    open('Semana 1');
    await user.click(toggle('Semana 2'));
    closed('Semana 2');
    expect(link('Traducción')).toBeNull();
    await act(() => router.navigate(`${COURSE}/assessments/certamen-2/notes`));
    open('Semana 1');
    closed('Semana 2');
    await act(() => router.navigate(`${COURSE}/notes/12-extra`));
    open('Semana 1');
    open('Semana 2');
    expect(link('Clase extra')).toHaveAttribute('aria-current', 'page');
    await act(() => router.navigate(`${COURSE}/notes/otra-clase`));
    await act(() => router.navigate(`${COURSE}/notes/11-traduccion`));
    closed('Semana 1');
    open('Semana 2');
  });

  it('opens and closes with the keyboard', async () => {
    const user = userEvent.setup();
    renderApp(`${COURSE}/notes/11-traduccion`, { api: weeks() });
    await ready();
    toggle('Semana 1').focus();
    await user.keyboard('{Enter}');
    open('Semana 1');
    await user.keyboard(' ');
    closed('Semana 1');
  });

  it('scrolls the menu, and only the menu, to bring the page open into sight', async () => {
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const row = this.getAttribute('aria-current') === 'page';
      return DOMRect.fromRect(row ? { y: 900, height: 30 } : { y: 64, height: 600 });
    });
    const { container } = renderApp(`${COURSE}/notes/12-extra`, { api: weeks() });
    await ready();
    const box = screen.getAllByRole('navigation', { name: 'Menú del sitio' })[0]!.parentElement!;
    await waitFor(() => expect(box.scrollTop).toBe(266));
    expect(container.ownerDocument.documentElement.scrollTop).toBe(0);
    rect.mockRestore();
  });
});

describe('the account menu', () => {
  it('«Ayuda» goes to the help page', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/home');
    await user.click(await screen.findByRole('button', { name: /tu cuenta$/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Ayuda' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/help'));
  });

  it('«Cerrar sesión» signs out and goes to the landing page', async () => {
    const user = userEvent.setup();
    const { router, session } = renderApp('/home');
    await user.click(await screen.findByRole('button', { name: /tu cuenta$/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Cerrar sesión' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(await session.current()).toBeNull();
  });
});
