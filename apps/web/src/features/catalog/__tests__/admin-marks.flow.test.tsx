// Tests what the admin mode adds to the pages (a tag on each page a student does not see, a mark on each element of a
// list) and that, as a student, an administrator sees the same pages as one.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { Catalog } from '@qv/schema';
import { adminKey } from '@qv/schema/http';
import { fakeApi } from '../../../test/fakes/api';
import { CATALOG } from '../../../test/fixtures/catalog';
import { renderApp } from '../../../test/render';
import { localAdminRepository } from '../../admin/api/repository';

afterEach(() => window.localStorage.clear());

const ADMIN_CATALOG: Catalog = {
  ...CATALOG,
  adminOnly: {
    [adminKey('course', 'fisica')]: ['hiddenCourse'],
    [adminKey('note', 'AP-BC-C2-11')]: ['draft'],
    [adminKey('semester', 1)]: ['hiddenSemester'],
    [adminKey('course', 'anatomia-1')]: ['hiddenSemester', 'draft'],
  },
};

const PAGES = ['/home', '/courses', '/semesters/2', '/semesters/2/courses/biologia-celular'];
const MARKS = '[data-admin-tag], [data-admin-mark], [data-admin-note]';

/** The page and the menu as they are, without the ids React gives to what it generates. */
const body = () =>
  [screen.getByRole('main'), screen.getByRole('navigation', { name: 'Menú del sitio' })]
    .map((e) => e.innerHTML.replace(/_r_[a-z0-9]+_|:r[a-z0-9]+:/g, 'id'))
    .join('\n');

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

  it('shows no tag, mark or notice in the student mode, whoever the user is', async () => {
    const { router } = renderApp('/home', {
      admin: localAdminRepository({ admin: true }),
      adminApi: fakeApi({ catalog: async () => ADMIN_CATALOG }),
      api: fakeApi(),
    });
    expect(await screen.findByRole('switch', { name: 'Modo admin' })).not.toBeChecked();
    for (const page of PAGES) {
      await router.navigate(page);
      await waitFor(() => expect(screen.getByRole('main')).not.toBeEmptyDOMElement());
      expect(document.querySelector(MARKS), page).toBeNull();
    }
  });

  it('an administrator in the student mode sees the pages and the menu a student sees', async () => {
    const seen: Record<string, string> = {};
    const first = renderApp('/home', { admin: localAdminRepository({ admin: false }) });
    for (const page of PAGES) {
      await first.router.navigate(page);
      await screen.findByRole('navigation', { name: 'Menú del sitio' });
      await waitFor(() => expect(screen.getByRole('main')).not.toBeEmptyDOMElement());
      seen[page] = body();
    }
    first.unmount();

    const admin = renderApp('/home', {
      admin: localAdminRepository({ admin: true }),
      adminApi: fakeApi({ catalog: async () => ADMIN_CATALOG }),
    });
    expect(await screen.findByRole('switch', { name: 'Modo admin' })).not.toBeChecked();
    for (const page of PAGES) {
      await admin.router.navigate(page);
      await waitFor(() => expect(body()).toBe(seen[page]));
    }
  });

  it('turns the tags on and off with the switch, and never keeps what the other mode showed', async () => {
    renderApp('/semesters/2/courses/fisica', {
      admin: localAdminRepository({ admin: true }),
      adminApi: fakeApi({ catalog: async () => ADMIN_CATALOG }),
    });
    const toggle = await screen.findByRole('switch', { name: 'Modo admin' });
    expect(document.querySelector(MARKS)).toBeNull();
    await userEvent.click(toggle);
    await waitFor(() => expect(document.querySelector('[data-admin-tag]')).not.toBeNull());
    await userEvent.click(screen.getByRole('switch', { name: 'Modo admin' }));
    await waitFor(() => expect(document.querySelector(MARKS)).toBeNull());
  });
});
