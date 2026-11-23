// Characterizes each part of the home page: greeting, the reserved space, errors, first steps, «Hoy», «Seguir» and
// «Tus ramos», with what they show and what they save.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeApi } from '../../../test/fakes/api';
import { fullAnkiStudy } from '../../../test/fakes/repositories';
import { SESSION_ANA } from '../../../test/fixtures/session';
import { renderApp } from '../../../test/render';
import { localStudyRepository } from '../../progress/api/repository';
import type { StudyPreferences, StudyRepository } from '../../progress/api/repository';
import { localQuizRepository } from '../../quiz/api/repository';
import { chooseIn } from '../../../test/dom';

// A Tuesday of November, at noon in Santiago: the same study day from 11 hours behind UTC to 12 ahead.
const NOW = new Date('2026-11-10T12:00:00-03:00');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

const student = () => localStudyRepository(null, { welcomeSeen: true });

function saving(study: StudyRepository) {
  const saved: StudyPreferences[] = [];
  const save = study.savePreferences.bind(study);
  // What is stored after each save, as the database gives it back.
  study.savePreferences = async (p) => {
    const stored = await save(p);
    saved.push(stored);
    return stored;
  };
  return saved;
}

const text = (el: Element) => el.textContent;

describe('the greeting', () => {
  it('says the first name, or only «Hola» without one', async () => {
    const { unmount } = renderApp('/home');
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Hola, Ana');
    expect(screen.getByText('¿Qué toca estudiar hoy?')).toBeInTheDocument();
    unmount();
    renderApp('/home', { session: { ...SESSION_ANA, user: { ...SESSION_ANA.user, name: null } } });
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(/^Hola$/);
  });
});

describe('the space while it loads', () => {
  const never = () => {
    const study = fullAnkiStudy();
    study.answeredDecks = () => new Promise(() => {});
    return study;
  };

  it('is as tall as the page was the last time, or 1100 px', async () => {
    window.localStorage.setItem('qv-home-height', '1500');
    const { container, unmount } = renderApp('/home', { study: never() });
    await screen.findByRole('heading', { level: 1 });
    const busy = () => container.querySelector<HTMLElement>('[aria-busy="true"]')!;
    await waitFor(() => expect(busy()).not.toBeNull());
    expect(busy().style.minHeight).toBe('1500px');
    expect(busy().className).toBe('flow-root');
    expect(busy().children).toHaveLength(2);
    unmount();
    window.localStorage.setItem('qv-home-height', '50');
    const second = renderApp('/home', { study: never() });
    await waitFor(() =>
      expect(
        second.container.querySelector<HTMLElement>('[aria-busy="true"]')!.style.minHeight,
      ).toBe('1100px'),
    );
  });

  it('once shown, the page saves its height', async () => {
    renderApp('/home');
    await screen.findByRole('region', { name: 'Hoy' });
    await waitFor(() => expect(window.localStorage.getItem('qv-home-height')).toBe('0'));
  });
});

describe('what does not come', () => {
  it('the catalog: «Reintentar» asks for it again', async () => {
    let calls = 0;
    const api = fakeApi();
    const catalog = api.catalog;
    api.catalog = (...a) => (++calls === 1 ? Promise.reject(new Error('sin red')) : catalog(...a));
    renderApp('/home', { api });
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('region', { name: 'Hoy' })).toBeInTheDocument();
    expect(calls).toBe(2);
  });

  it('the plan: «Reintentar» in its place', async () => {
    const study = fullAnkiStudy();
    let calls = 0;
    const activations = study.deckActivations.bind(study);
    study.deckActivations = () =>
      ++calls === 1 ? Promise.reject(new Error('sin red')) : activations();
    renderApp('/home', { study });
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('region', { name: 'Hoy' })).toBeInTheDocument();
    expect(calls).toBe(2);
  });
});

describe('the first steps', () => {
  it('go one by one, and «Ocultar» saves that they are hidden', async () => {
    const study = student();
    const saved = saving(study);
    renderApp('/home', { study });
    const steps = await screen.findByRole('region', { name: 'Primeros pasos' });
    expect(text(steps)).toMatchInlineSnapshot(
      `"Primeros pasosOcultar1Elige tus ramos (pendiente)Di en qué semestre estás o agrega un ramo, y aparecen más abajo.Elegir ramos2Activa la semana o clase que estás viendo (pendiente)3Responde tu primera tarjeta (pendiente)"`,
    );
    expect(within(steps).getByRole('link', { name: 'Elegir ramos' })).toHaveAttribute(
      'href',
      '#tus-ramos',
    );
    const mine = screen.getByRole('region', { name: 'Tus ramos' });
    await chooseIn(
      within(mine).getByRole('button', { name: /¿En qué semestre estás\?/ }),
      '1° Semestre',
    );
    await within(steps).findByRole('link', { name: 'Ir a tu ramo' });
    expect(text(steps)).toMatchInlineSnapshot(
      `"Primeros pasosOcultarElige tus ramos (hecho)2Activa la semana o clase que estás viendo (pendiente)Así empiezan a salir sus tarjetas nuevas.Ir a tu ramo3Responde tu primera tarjeta (pendiente)"`,
    );
    expect(within(steps).getByRole('link', { name: 'Ir a tu ramo' })).toHaveAttribute(
      'href',
      '/semesters/1/courses/anatomia-1',
    );
    expect(saved.at(-1)?.semester).toBe(1);
    await userEvent.click(within(steps).getByRole('button', { name: 'Ocultar' }));
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Primeros pasos' })).toBeNull(),
    );
    expect(saved.at(-1)?.dismissed).toEqual(['first-steps']);
    expect(saved.at(-1)?.semester).toBe(1);
  });

  it('with a week on, the third one takes to study it', async () => {
    const study = student();
    await study.setDeckActivation('5', true);
    renderApp('/home', { study });
    const steps = await screen.findByRole('region', { name: 'Primeros pasos' });
    expect(text(steps)).toMatchInlineSnapshot(
      `"Primeros pasosOcultarElige tus ramos (hecho)Activa la semana o clase que estás viendo (hecho)3Responde tu primera tarjeta (pendiente)Muestra la respuesta y di si te la sabías. Estudiar"`,
    );
    expect(within(steps).getByRole('link', { name: 'Estudiar' })).toHaveAttribute(
      'href',
      '/semesters/1/courses/anatomia-1/anki/study',
    );
  });
});

describe('«Hoy»', () => {
  it('with nothing on, offers to choose what to study', async () => {
    renderApp('/home', { study: student() });
    const today = await screen.findByRole('region', { name: 'Hoy' });
    expect(text(today)).toMatchInlineSnapshot(
      `"HoyTodavía no activas ninguna semana o clase. Cuando lo hagas, aquí verás lo que te toca cada día.Elegir qué estudiar"`,
    );
    expect(within(today).getByRole('link', { name: 'Elegir qué estudiar' })).toHaveAttribute(
      'href',
      '#tus-ramos',
    );
  });

  it('a course with a week on: its link, its load and «Estudiar»', async () => {
    renderApp('/home');
    const today = await screen.findByRole('region', { name: 'Hoy' });
    const study = await within(today).findByRole('link', { name: /Estudiar/ });
    expect(study).toHaveAttribute('href', '/semesters/1/courses/anatomia-1/anki/study');
    const course = within(today).getByRole('link', { name: /Anatomía I/ });
    expect(course).toHaveAttribute('href', '/semesters/1/courses/anatomia-1');
    expect(text(course)).toBe('🦴 Anatomía I');
    expect(within(today).getAllByRole('listitem')).toHaveLength(1);
    expect(within(today).getByRole('button', { name: /para hoy/ })).toBeInTheDocument();
  });

  it('with nothing left, «Listo por hoy» instead of «Estudiar»', async () => {
    const study = fullAnkiStudy();
    study.homeCounts = async (ids) => ({
      truncated: false,
      decks: ids.map((deckId) => ({
        deckId,
        seen: 99,
        hiddenNew: 0,
        touched: 0,
        suspended: 0,
        recall: 0,
        due: [],
      })),
    });
    renderApp('/home', { study });
    const today = await screen.findByRole('region', { name: 'Hoy' });
    expect(await within(today).findByText('Listo por hoy')).toBeInTheDocument();
    expect(within(today).queryByRole('link', { name: /Estudiar/ })).toBeNull();
    expect(text(within(today).getByRole('listitem'))).toMatchInlineSnapshot(
      `"🦴 Anatomía I0 % de dominioDominio: cuánto recordarías hoy de esta materia, según tus repasos. Lo que no has visto cuenta como 0.Listo por hoy"`,
    );
  });

  it('counts that do not come: «Reintentar»', async () => {
    const study = fullAnkiStudy();
    let calls = 0;
    const counts = study.homeCounts.bind(study);
    study.homeCounts = (...a) =>
      ++calls === 1 ? Promise.reject(new Error('sin red')) : counts(...a);
    renderApp('/home', { study });
    const today = await screen.findByRole('region', { name: 'Hoy' });
    await userEvent.click(await within(today).findByRole('button', { name: 'Reintentar' }));
    expect(await within(today).findByRole('link', { name: /Estudiar/ })).toBeInTheDocument();
    expect(calls).toBe(2);
  });
});

describe('«Seguir»', () => {
  const rounds = () => {
    const quiz = localQuizRepository(null);
    quiz.openRounds = async () => [
      {
        quizId: 'practica-biocel',
        sectionId: 'pautas',
        answered: 2,
        questionCount: 4,
        updatedAt: '2026-11-09T12:00:00.000Z',
      },
      {
        quizId: 'no-existe',
        sectionId: 'x',
        answered: 1,
        questionCount: 3,
        updatedAt: '2026-11-09T12:00:00.000Z',
      },
    ];
    return quiz;
  };

  it('a test half done, with its section', async () => {
    renderApp('/home', { quiz: rounds() });
    const follow = await screen.findByRole('region', { name: 'Seguir' });
    expect(text(follow)).toMatchInlineSnapshot(`"SeguirPráctica de BiocelTest a medias · 2 de 4"`);
    expect(within(follow).getByRole('link')).toHaveAttribute(
      'href',
      '/semesters/2/courses/biologia-celular/tests/certamen-2/practica/pautas',
    );
  });

  it('the last note opened, after one test', async () => {
    window.localStorage.setItem('qv-last-note', '11-traduccion');
    renderApp('/home', { quiz: rounds() });
    const follow = await screen.findByRole('region', { name: 'Seguir' });
    expect(text(follow)).toMatchInlineSnapshot(
      `"SeguirPráctica de BiocelTest a medias · 2 de 4TraducciónÚltimo apunte que abriste · Biología celular"`,
    );
    expect(
      within(follow)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href')),
    ).toEqual([
      '/semesters/2/courses/biologia-celular/tests/certamen-2/practica/pautas',
      '/semesters/2/courses/biologia-celular/notes/11-traduccion',
    ]);
  });

  it('nothing to follow, no section', async () => {
    renderApp('/home');
    await screen.findByRole('region', { name: 'Hoy' });
    expect(screen.queryByRole('region', { name: 'Seguir' })).toBeNull();
  });

  it('two tests at most, or only the first beside the last note', async () => {
    const quiz = localQuizRepository(null);
    quiz.openRounds = async () =>
      ['pautas', 'nuevas', 'otras'].map((sectionId, i) => ({
        quizId: 'practica-biocel',
        sectionId,
        answered: i + 1,
        questionCount: 4,
        updatedAt: '2026-11-09T12:00:00.000Z',
      }));
    const { unmount } = renderApp('/home', { quiz });
    const follow = await screen.findByRole('region', { name: 'Seguir' });
    expect(text(follow)).toBe(
      'SeguirPráctica de BiocelTest a medias · 1 de 4Práctica de BiocelTest a medias · 2 de 4',
    );
    expect(
      within(follow)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href')),
    ).toEqual([
      '/semesters/2/courses/biologia-celular/tests/certamen-2/practica/pautas',
      '/semesters/2/courses/biologia-celular/tests/certamen-2/practica/nuevas',
    ]);
    unmount();
    window.localStorage.setItem('qv-last-note', '11-traduccion');
    renderApp('/home', { quiz });
    expect(text(await screen.findByRole('region', { name: 'Seguir' }))).toBe(
      'SeguirPráctica de BiocelTest a medias · 1 de 4TraducciónÚltimo apunte que abriste · Biología celular',
    );
  });
});

describe('«Tus ramos»', () => {
  it('the semester’s courses, the ones without material in one line, and a course from another semester', async () => {
    const study = student();
    const saved = saving(study);
    renderApp('/home', { study });
    const mine = await screen.findByRole('region', { name: 'Tus ramos' });
    expect(text(mine)).toMatchInlineSnapshot(
      `"Tus ramos¿En qué semestre estás?Elige tu semestreAgregar un ramo de otro semestreElige tu semestre o agrega un ramo, y aquí aparecen, con sus apuntes, tests y tarjetas."`,
    );
    await chooseIn(
      within(mine).getByRole('button', { name: /¿En qué semestre estás\?/ }),
      '2° Semestre',
    );
    await waitFor(() => expect(within(mine).getAllByRole('listitem')).toHaveLength(1));
    expect(text(mine)).toMatchInlineSnapshot(
      `"Tus ramos¿En qué semestre estás?2° SemestreAgregar un ramo de otro semestre🧬Biología celular2 apuntesPróximamente: Física."`,
    );
    expect(within(mine).getByRole('link', { name: /Biología celular/ })).toHaveAttribute(
      'href',
      '/semesters/2/courses/biologia-celular',
    );
    await chooseIn(
      within(mine).getByRole('button', { name: /Agregar un ramo de otro semestre/ }),
      '🦴 Anatomía I · 1° Semestre',
    );
    await waitFor(() => expect(within(mine).getAllByRole('listitem')).toHaveLength(2));
    expect(saved.at(-1)).toMatchObject({ semester: 2, addedCourses: ['anatomia-1'] });
    const add = within(mine).getByRole('button', { name: /Agregar un ramo de otro semestre/ });
    expect(add).toBeDisabled();
    expect(add).toHaveTextContent('No hay más ramos con material');
    await userEvent.click(
      within(mine).getByRole('button', { name: 'Quitar Anatomía I de tus ramos' }),
    );
    await waitFor(() => expect(within(mine).getAllByRole('listitem')).toHaveLength(1));
    await waitFor(() => expect(document.activeElement).toBe(add));
    expect(saved.at(-1)).toMatchObject({ addedCourses: [], removedCourses: ['anatomia-1'] });
  });

  it('a line to the whole career', async () => {
    renderApp('/home');
    const link = await screen.findByRole('link', { name: 'Ver toda la carrera' });
    expect(link).toHaveAttribute('href', '/courses');
  });
});
