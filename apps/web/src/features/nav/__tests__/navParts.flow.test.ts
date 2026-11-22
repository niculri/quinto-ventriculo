// Characterizes the site's menu: which assessments are open on each page, and that what was opened or closed by hand
// is forgotten on going to another page.
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
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
