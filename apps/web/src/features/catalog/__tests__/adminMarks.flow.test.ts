// Tests what the admin mode adds to the pages (a tag on each page a student does not see, a mark on each element of a
// list) and that, as a student, an administrator sees the same pages as one.
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Catalog } from '@qv/schema';
import { adminKey } from '@qv/schema/http';
import { fakeApi } from '../../../test/fakes/api';
import { CATALOG } from '../../../test/fixtures/catalog';
import { adminModeIsOn, toggleAdminMode } from '../../../test/adminMode';
import { renderApp } from '../../../test/render';
import { localAdminRepository } from '../../admin/api/repository';

afterEach(() => window.localStorage.clear());

/** Física has a note in the admin mode's catalog: what has nothing at all has no page, there either. */
function withPhysics(): Catalog['semesters'] {
  const semesters = structuredClone(CATALOG.semesters);
  const bio = semesters[1]!.courses[0]!.assessments[0]!;
  semesters[1]!.courses[1]!.assessments = [
    {
      ...bio,
      id: 'fisica/certamen-1',
      courseId: 'fisica',
      name: 'Certamen 1',
      notes: [
        { ...bio.notes[0]!, id: 'AP-FI-1', slug: 'fluidos', assessmentId: 'fisica/certamen-1' },
      ],
      quizzes: [],
    },
  ];
  return semesters;
}

const ADMIN_CATALOG: Catalog = {
  ...CATALOG,
  semesters: withPhysics(),
  adminOnly: {
    [adminKey('course', 'fisica')]: ['hiddenCourse'],
    [adminKey('note', 'AP-BC-C2-11')]: ['draft'],
    [adminKey('semester', 1)]: ['hiddenSemester'],
    [adminKey('course', 'anatomia-1')]: ['hiddenSemester', 'draft'],
  },
};

const PAGES = [
  '/home',
  '/courses',
  '/semesters/2',
  '/semesters/2/courses/biologia-celular',
  '/search?q=ribosomas',
];
const MARKS = '[data-admin-tag], [data-admin-mark], [data-admin-note]';

/** The page and the menu as they are, without the ids React gives to what it generates. */
const body = () =>
  [screen.getByRole('main'), screen.getByRole('navigation', { name: 'Menú del sitio' })]
    .map((e) => e.innerHTML.replace(/_r_[a-z0-9]+_|:r[a-z0-9]+:/g, 'id'))
    .join('\n');

/**
 * The page, with what it reads: no loading placeholder, and the same twice in a row. Not the page before it, which
 * stays on screen, just as steady, while a page's code loads for the first time.
 */
const loaded = async (before?: string) => {
  let last = '';
  await waitFor(
    () => {
      const now = body();
      const steady =
        now === last && now !== before && !document.querySelector('main .animate-pulse');
      last = now;
      expect(steady).toBe(true);
    },
    { interval: 150 },
  );
  return last;
};

describe('the admin mode in the pages', () => {
  it('tags the page that only an administrator sees, and every element of a list that is such', async () => {
    window.localStorage.setItem('qv-admin-mode', 'admin');
    const { router } = renderApp('/semesters/2/courses/fisica', {
      admin: localAdminRepository({ admin: true }),
      adminApi: fakeApi({ catalog: async () => ADMIN_CATALOG }),
    });
    const tag = await waitFor(() => {
      const t = document.querySelector('[data-admin-tag]');
      expect(t).not.toBeNull();
      return t as HTMLElement;
    });
    expect(tag).toHaveTextContent('Ramo apagado');
    expect(within(tag).queryByText('Borrador')).toBeNull();

    await router.navigate('/semesters/1');
    await waitFor(() =>
      expect(document.querySelector('[data-admin-tag]')).toHaveTextContent('Semestre oculto'),
    );
    // The course says «Borrador» alone: «Semestre oculto» is already said by the semester it is in. The menu says
    // the semester's and the course's, and the page's list the course's.
    expect([...document.querySelectorAll('[data-admin-mark]')].map((m) => m.textContent)).toEqual([
      'Semestre oculto',
      'Borrador',
      'Borrador',
    ]);
  });

  it('marks the course of «Hoy» and the notes of the search, as the lists of the career do', async () => {
    window.localStorage.setItem('qv-admin-mode', 'admin');
    const { router } = renderApp('/home', {
      admin: localAdminRepository({ admin: true }),
      adminApi: fakeApi({ catalog: async () => ADMIN_CATALOG }),
    });
    const today = await screen.findByRole('region', { name: 'Hoy' });
    await waitFor(() => {
      const marks = [...today.querySelectorAll('[data-admin-mark] > span')].map(
        (m) => m.textContent,
      );
      expect(marks).toEqual(['Semestre oculto', 'Borrador']);
    });
    await router.navigate('/search?q=ribosomas');
    const main = await screen.findByRole('main');
    await waitFor(() => expect(within(main).getByText('Borrador')).toBeInTheDocument());
    expect(main.querySelectorAll('[data-admin-mark]')).toHaveLength(1);
  });

  it('shows no tag, mark or notice in the student mode, whoever the user is', async () => {
    const { router } = renderApp('/home', {
      admin: localAdminRepository({ admin: true }),
      adminApi: fakeApi({ catalog: async () => ADMIN_CATALOG }),
      api: fakeApi(),
    });
    expect(await adminModeIsOn()).toBe(false);
    for (const page of PAGES) {
      await router.navigate(page);
      await waitFor(() => expect(screen.getByRole('main')).not.toBeEmptyDOMElement());
      expect(document.querySelector(MARKS), page).toBeNull();
    }
  });

  it('an administrator in the student mode sees the pages and the menu a student sees', async () => {
    const seen: Record<string, string> = {};
    const first = renderApp('/home', { admin: localAdminRepository({ admin: false }) });
    let before: string | undefined;
    for (const page of PAGES) {
      await first.router.navigate(page);
      await screen.findByRole('navigation', { name: 'Menú del sitio' });
      before = seen[page] = await loaded(before);
    }
    first.unmount();

    const admin = renderApp('/home', {
      admin: localAdminRepository({ admin: true }),
      adminApi: fakeApi({ catalog: async () => ADMIN_CATALOG }),
    });
    expect(await adminModeIsOn()).toBe(false);
    before = undefined;
    for (const page of PAGES) {
      await admin.router.navigate(page);
      before = await loaded(before);
      expect(before).toBe(seen[page]);
    }
  });

  it('turns the tags on and off with the switch, and never keeps what the other mode showed', async () => {
    renderApp('/semesters/2/courses/fisica', {
      admin: localAdminRepository({ admin: true }),
      adminApi: fakeApi({ catalog: async () => ADMIN_CATALOG }),
    });
    await screen.findByRole('heading', { level: 1 });
    expect(document.querySelector(MARKS)).toBeNull();
    await toggleAdminMode();
    await waitFor(() => expect(document.querySelector('[data-admin-tag]')).not.toBeNull());
    await toggleAdminMode();
    await waitFor(() => expect(document.querySelector(MARKS)).toBeNull());
  });
});
