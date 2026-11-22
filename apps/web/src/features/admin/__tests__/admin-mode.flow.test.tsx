// Tests the admin mode from the top bar: the site read with the admin API, how it is left and how it is remembered.
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeApi } from '../../../test/fakes/api';
import { fullAnkiStudy } from '../../../test/fakes/repositories';
import { CATALOG } from '../../../test/fixtures/catalog';
import { adminModeIsOn, hasAdminModeRow, toggleAdminMode } from '../../../test/adminMode';
import { renderApp } from '../../../test/render';
import { localAdminRepository } from '../api/repository';
import { RELEASE_OVERVIEW, RELEASE_SUMMARY, releaseApi } from '../../../test/releases';

afterEach(() => window.localStorage.clear());

const ACTIVE =
  'Modo admin: ves el borrador y lo que está apagado para los alumnos; tu avance es el de siempre.';

describe('the admin mode', () => {
  it('reads the site with the admin API, in a cache of its own, and leaves nothing when it ends', async () => {
    const published = vi.fn(async () => CATALOG);
    const draft = vi.fn(async () => CATALOG);
    const { router } = renderApp('/admin/releases', {
      admin: localAdminRepository({ admin: true }),
      api: releaseApi({ catalog: published }),
      adminApi: releaseApi({ catalog: draft }),
    });
    await toggleAdminMode();
    expect(window.localStorage.getItem('qv-admin-mode')).toBe('admin');
    expect(screen.getByText(ACTIVE)).toBeInTheDocument();
    await waitFor(() => expect(draft).toHaveBeenCalled());
    published.mockClear();
    await act(() => router.navigate('/home'));
    await waitFor(() => expect(draft).toHaveBeenCalled());
    expect(published).not.toHaveBeenCalled();
    await act(() => router.navigate('/admin/releases'));
    await toggleAdminMode();
    await waitFor(() => expect(screen.queryByText(ACTIVE)).toBeNull());
    expect(window.localStorage.getItem('qv-admin-mode')).toBe('student');
    draft.mockClear();
    await act(() => router.navigate('/home'));
    expect(await screen.findByRole('heading', { name: /Hola/ })).toBeInTheDocument();
    expect(draft).not.toHaveBeenCalled();
  });

  it('a browser left in the admin mode, where somebody who is not an administrator signs in, leaves it', async () => {
    window.localStorage.setItem('qv-admin-mode', 'admin');
    const published = vi.fn(async () => CATALOG);
    const draft = vi.fn(async () => CATALOG);
    const study = fullAnkiStudy();
    const progress = vi.spyOn(study, 'deckProgress');
    const { router } = renderApp('/home', {
      api: fakeApi({ catalog: published }),
      adminApi: fakeApi({ catalog: draft }),
      study,
    });
    await waitFor(() => expect(window.localStorage.getItem('qv-admin-mode')).toBe('student'));
    expect(screen.queryByText(ACTIVE)).toBeNull();
    expect(await hasAdminModeRow()).toBe(false);
    await waitFor(() => expect(published).toHaveBeenCalled());
    await waitFor(() => expect(progress).toHaveBeenCalled());
    draft.mockClear();
    await act(() => router.navigate('/settings/anki'));
    await act(() => router.navigate('/home'));
    expect(await screen.findByRole('heading', { name: /Hola/ })).toBeInTheDocument();
    expect(draft).not.toHaveBeenCalled();
  });

  it('a mark checked in the admin mode is checked after leaving it', async () => {
    let marks: {
      mark: 'phone' | 'answers' | 'announcement';
      checkedBy: string;
      checkedAt: string;
    }[] = [];
    const server = {
      releaseOverview: async () => ({
        ...RELEASE_OVERVIEW,
        summary: { ...RELEASE_SUMMARY, marks },
      }),
      setReleaseMark: async (
        _fp: string,
        mark: 'phone' | 'answers' | 'announcement',
        on: boolean,
      ) => {
        marks = on
          ? [{ mark, checkedBy: 'ana@ug.uchile.cl', checkedAt: '2026-11-07T12:00:00Z' }]
          : [];
        return { marks };
      },
    };
    renderApp('/admin/releases', {
      admin: localAdminRepository({ admin: true }),
      api: releaseApi(server),
      adminApi: releaseApi(server),
    });
    await toggleAdminMode();
    const phone = await screen.findByRole('switch', { name: 'Vi lo nuevo en el teléfono' });
    await userEvent.click(phone);
    expect(await screen.findByText('Marcada por ana@ug.uchile.cl')).toBeInTheDocument();
    await toggleAdminMode();
    await waitFor(() => expect(screen.queryByText(ACTIVE)).toBeNull());
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Vi lo nuevo en el teléfono' })).toBeChecked(),
    );
    expect(screen.getByText('Marcada por ana@ug.uchile.cl')).toBeInTheDocument();
  });

  it('signing out keeps the mode this browser had: it is only remembered', async () => {
    renderApp('/admin/releases', {
      admin: localAdminRepository({ admin: true }),
      api: releaseApi(),
      adminApi: releaseApi(),
    });
    await toggleAdminMode();
    expect(await screen.findByText(ACTIVE)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /tu cuenta$/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Cerrar sesión/ }));
    expect(window.localStorage.getItem('qv-admin-mode')).toBe('admin');
  });

  it('starts as a student, and in the mode the browser remembered', async () => {
    const draft = vi.fn(async () => CATALOG);
    const published = vi.fn(async () => CATALOG);
    const first = renderApp('/home', {
      admin: localAdminRepository({ admin: true }),
      api: fakeApi({ catalog: published }),
      adminApi: fakeApi({ catalog: draft }),
    });
    expect(await adminModeIsOn()).toBe(false);
    await waitFor(() => expect(published).toHaveBeenCalled());
    expect(draft).not.toHaveBeenCalled();
    first.unmount();

    window.localStorage.setItem('qv-admin-mode', 'admin');
    renderApp('/home', {
      admin: localAdminRepository({ admin: true }),
      api: fakeApi({ catalog: published }),
      adminApi: fakeApi({ catalog: draft }),
    });
    expect(await adminModeIsOn()).toBe(true);
    await waitFor(() => expect(draft).toHaveBeenCalled());
  });

  it('is offered only to an administrator', async () => {
    renderApp('/home', { admin: localAdminRepository({ admin: false }) });
    expect(await screen.findByRole('heading', { name: /Hola/ })).toBeInTheDocument();
    expect(await hasAdminModeRow()).toBe(false);
  });

  it('without the API for it (a build that cannot), the switch is not there', async () => {
    renderApp('/admin/releases', {
      admin: localAdminRepository({ admin: true }),
      api: releaseApi(),
    });
    expect(await screen.findByRole('heading', { name: 'Publicaciones' })).toBeInTheDocument();
    expect(await hasAdminModeRow()).toBe(false);
    expect(window.localStorage.getItem('qv-admin-mode')).toBeNull();
  });
});
