// The pages of the career, a course and an assessment's lists when the catalog fails or is unusual: «Reintentar»,
// their own addresses, years past the seventh, an assessment of only seminars, and the Anki card and chips of a note.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Catalog, NoteSummary } from '@qv/schema';
import { adminKey } from '@qv/schema/http';
import { ApiRequestError } from '../../../shared/lib/api';
import { localAdminRepository } from '../../admin/api/repository';
import { fakeApi } from '../../../test/fakes/api';
import { fullAnkiStudy } from '../../../test/fakes/repositories';
import { CATALOG } from '../../../test/fixtures/catalog';
import { renderApp } from '../../../test/render';

const main = () => within(screen.getByRole('main'));
const inMain = async () => within(await screen.findByRole('main'));

const note = (over: Partial<NoteSummary>): NoteSummary => ({
  ...CATALOG.semesters[0]!.courses[0]!.assessments[0]!.notes[0]!,
  ...CATALOG.semesters[1]!.courses[0]!.assessments[0]!.notes[0]!,
  courseId: 'anatomia-1',
  assessmentId: 'anatomia-1/certamen-1',
  ...over,
});

/** The catalog with Anatomía I's Certamen 1 changed. */
function anatomy(
  change: (a: Catalog['semesters'][number]['courses'][number]['assessments'][number]) => void,
) {
  const c = structuredClone(CATALOG);
  change(c.semesters[0]!.courses[0]!.assessments[0]!);
  return c;
}

describe('a catalog that fails', () => {
  it.each([
    ['the career', '/courses', 'Primer año'],
    ['a course', '/semesters/2/courses/biologia-celular', 'Certamen 2'],
    [
      'an assessment’s notes',
      '/semesters/2/courses/biologia-celular/assessments/certamen-2/notes',
      'Traducción',
    ],
    [
      'an assessment’s tests',
      '/semesters/2/courses/biologia-celular/assessments/certamen-2/tests',
      'Práctica de Biocel',
    ],
    ['a semester', '/semesters/2', 'Biología celular'],
  ])('on %s, says why with «Reintentar», which asks again', async (_, path, shown) => {
    const catalog = vi
      .fn<() => Promise<Catalog>>()
      .mockRejectedValueOnce(new ApiRequestError(500, 'internal', 'Falló el catálogo.'))
      .mockResolvedValue(CATALOG);
    renderApp(path, { api: fakeApi({ catalog }) });
    expect(await screen.findByText('Falló el catálogo.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await (await inMain()).findAllByText(shown)).not.toHaveLength(0);
    expect(catalog).toHaveBeenCalledTimes(2);
  });
});

describe('the addresses', () => {
  it('a course under another semester goes to its own', async () => {
    const { router } = renderApp('/semesters/1/courses/biologia-celular');
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/semesters/2/courses/biologia-celular'),
    );
  });

  it.each([
    '/semesters/2/courses/no-existe',
    '/semesters/2/courses/biologia-celular/assessments/no-existe/notes',
    '/semesters/2/courses/biologia-celular/assessments/no-existe/tests',
    '/semesters/9',
  ])('%s does not exist', async (path) => {
    renderApp(path);
    expect(await screen.findByText('404')).toBeInTheDocument();
  });
});

describe('the career', () => {
  it('a year past the seventh is named by its number', async () => {
    const c = structuredClone(CATALOG);
    c.semesters.push({ ...c.semesters[1]!, number: 15, name: '15° Semestre' });
    renderApp('/courses', { api: fakeApi({ catalog: async () => c }) });
    expect(
      await (await inMain()).findByRole('heading', { level: 2, name: '8.º año' }),
    ).toBeInTheDocument();
  });
});

describe('a course’s cards', () => {
  it('an assessment of only seminars counts them, without lectures', async () => {
    const c = structuredClone(CATALOG);
    const a = c.semesters[1]!.courses[0]!.assessments[0]!;
    a.notes = a.notes.map((n) => ({ ...n, kind: 'seminar' as const }));
    renderApp('/semesters/2/courses/biologia-celular', {
      api: fakeApi({ catalog: async () => c }),
    });
    const notes = await (await inMain()).findByRole('link', { name: /^Apuntes/ });
    expect(within(notes).getByText('2 seminarios')).toBeInTheDocument();
    expect(within(notes).queryByText(/clase/)).toBeNull();
  });

  it('until the study plan comes, the card neither counts today nor offers what to turn on', async () => {
    const study = fullAnkiStudy();
    const asked = vi.fn(() => new Promise<number | null>(() => {}));
    study.medianAnswerMs = asked;
    renderApp('/semesters/1/courses/anatomia-1', { study });
    const card = await (await inMain()).findByRole('link', { name: /^Anki/ });
    await waitFor(() => expect(asked).toHaveBeenCalled());
    expect(card).toHaveTextContent('1 mazo · 4 tarjetas');
    expect(within(card).queryByRole('group', { name: 'Hoy en Certamen 1' })).toBeNull();
    expect(main().queryByRole('button', { name: /Qué estás estudiando/ })).toBeNull();
  });

  it('an assessment’s deck without weeks or lectures offers none to turn on, and says it has nothing on', async () => {
    const c = structuredClone(CATALOG);
    c.anki.decks = c.anki.decks.filter((d) => !['5', '20', '21'].includes(d.id));
    renderApp('/semesters/1/courses/anatomia-1', { api: fakeApi({ catalog: async () => c }) });
    const today = await (await inMain()).findByRole('group', { name: 'Hoy en Certamen 1' });
    await waitFor(() => expect(today).toHaveTextContent('Sin activar'));
    expect(main().queryByRole('button', { name: /Qué estás estudiando/ })).toBeNull();
  });
});

describe('the Anki card in the admin mode', () => {
  it('a course deck only the draft has shows no mastery, and today waits for what the students have', async () => {
    window.localStorage.setItem('qv-admin-mode', 'admin');
    const draft = fakeApi({
      catalog: async () => ({ ...CATALOG, adminOnly: { [adminKey('deck', '3')]: ['draft'] } }),
      deck: async (id, _signal, op) => {
        if (op?.published) throw new ApiRequestError(404, 'not_found', 'Ese mazo no existe.');
        return fakeApi().deck(id);
      },
    });
    renderApp('/semesters/1/courses/anatomia-1', {
      admin: localAdminRepository({ admin: true }),
      adminApi: draft,
    });
    const card = await (await inMain()).findByRole('link', { name: /^Anki/ });
    await waitFor(() =>
      expect(within(card).getByText(/de dominio/).parentElement).toHaveTextContent(/^0 %/),
    );
    expect(within(card).queryByRole('group', { name: 'Hoy en Certamen 1' })).toBeNull();
  });
});

describe('the chips of a note', () => {
  const path = '/semesters/1/courses/anatomia-1/assessments/certamen-1/notes';

  it('a deck alone: its chip says how many of its cards are for today, and there is no test chip', async () => {
    const c = anatomy((a) => {
      a.notes = [
        note({
          id: 'AP-AN-01',
          slug: 'columna',
          title: 'Columna',
          practice: { deck: 'Mazo de prueba' },
        }),
      ];
    });
    renderApp(path, { api: fakeApi({ catalog: async () => c }) });
    const deck = await (await inMain()).findByRole('link', {
      name: /^Anki de Columna: \d+ para hoy$/,
    });
    const left = Number(/(\d+) para hoy/.exec(deck.getAttribute('aria-label')!)![1]);
    expect(left).toBeGreaterThan(0);
    expect(within(deck).getByText(String(left))).toBeInTheDocument();
    expect(main().queryByRole('link', { name: 'Test de Columna' })).toBeNull();
  });

  it('a test alone, without topics, goes to the test; a test the assessment lacks, no chip', async () => {
    const c = anatomy((a) => {
      a.quizzes = [
        {
          ...CATALOG.semesters[1]!.courses[0]!.assessments[0]!.quizzes[0]!,
          id: 'p-anato',
          assessmentId: a.id,
          courseId: 'anatomia-1',
          sectionCount: 1,
        },
      ];
      a.notes = [
        note({
          id: 'AP-AN-01',
          slug: 'columna',
          title: 'Columna',
          practice: { quizId: 'p-anato' },
        }),
        note({
          id: 'AP-AN-02',
          slug: 'otra',
          title: 'Otra',
          position: 2,
          practice: { quizId: 'gone' },
        }),
      ];
    });
    renderApp(path, { api: fakeApi({ catalog: async () => c }) });
    const test = await (await inMain()).findByRole('link', { name: 'Test de Columna' });
    expect(test).toHaveAttribute(
      'href',
      '/semesters/1/courses/anatomia-1/tests/certamen-1/practica',
    );
    expect(main().queryByRole('link', { name: /^Anki de Columna/ })).toBeNull();
    expect(main().queryByRole('link', { name: 'Test de Otra' })).toBeNull();
  });
});
