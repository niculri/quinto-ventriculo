// Tests the preview of the draft from «Publicaciones»: the site read with the preview API, and how it is left.
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeApi } from '../../../test/fakes/api';
import { fullAnkiStudy } from '../../../test/fakes/repositories';
import { CATALOG } from '../../../test/fixtures/catalog';
import { renderApp } from '../../../test/render';
import { localAdminRepository } from '../api/repository';
import { RELEASE_OVERVIEW, RELEASE_SUMMARY, releaseApi } from '../../../test/releases';

afterEach(() => window.sessionStorage.clear());

describe('the preview of the draft', () => {
  it('reads the site with the preview API, in a cache of its own, and leaves nothing when it ends', async () => {
    const published = vi.fn(async () => CATALOG);
    const draft = vi.fn(async () => CATALOG);
    const { router } = renderApp('/admin/releases', {
      admin: localAdminRepository({ admin: true }),
      api: releaseApi({ catalog: published }),
      previewApi: releaseApi({ catalog: draft }),
    });
    await userEvent.click(
      await screen.findByRole('switch', { name: 'Ver el sitio con el borrador' }),
    );
    expect(window.sessionStorage.getItem('qv-preview')).toBe('draft');
    expect(screen.getByText('Estás viendo el borrador, no lo publicado.')).toBeInTheDocument();
    await waitFor(() => expect(draft).toHaveBeenCalled());
    published.mockClear();
    await act(() => router.navigate('/home'));
    await waitFor(() => expect(draft).toHaveBeenCalled());
    expect(published).not.toHaveBeenCalled();
    await act(() => router.navigate('/admin/releases'));
    await userEvent.click(
      await screen.findByRole('switch', { name: 'Ver el sitio con el borrador' }),
    );
    await waitFor(() =>
      expect(screen.queryByText('Estás viendo el borrador, no lo publicado.')).toBeNull(),
    );
    expect(window.sessionStorage.getItem('qv-preview')).toBeNull();
    draft.mockClear();
    await act(() => router.navigate('/home'));
    expect(await screen.findByRole('heading', { name: /Hola/ })).toBeInTheDocument();
    expect(draft).not.toHaveBeenCalled();
  });

  it('a tab left in the preview, where somebody who is not an administrator signs in, leaves it', async () => {
    window.sessionStorage.setItem('qv-preview', 'draft');
    const published = vi.fn(async () => CATALOG);
    const draft = vi.fn(async () => CATALOG);
    const study = fullAnkiStudy();
    const progress = vi.spyOn(study, 'deckProgress');
    const { router } = renderApp('/home', {
      api: fakeApi({ catalog: published }),
      previewApi: fakeApi({ catalog: draft }),
      study,
    });
    await waitFor(() => expect(window.sessionStorage.getItem('qv-preview')).toBeNull());
    expect(screen.queryByText('Estás viendo el borrador, no lo publicado.')).toBeNull();
    await waitFor(() => expect(published).toHaveBeenCalled());
    await waitFor(() => expect(progress).toHaveBeenCalled());
    draft.mockClear();
    await act(() => router.navigate('/settings/anki'));
    await act(() => router.navigate('/home'));
    expect(await screen.findByRole('heading', { name: /Hola/ })).toBeInTheDocument();
    expect(draft).not.toHaveBeenCalled();
  });

  it('a mark checked in the preview is checked after leaving it', async () => {
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
      previewApi: releaseApi(server),
    });
    const toggle = await screen.findByRole('switch', { name: 'Ver el sitio con el borrador' });
    await userEvent.click(toggle);
    const phone = await screen.findByRole('switch', { name: 'Vi lo nuevo en el teléfono' });
    await userEvent.click(phone);
    expect(await screen.findByText('Marcada por ana@ug.uchile.cl')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('switch', { name: 'Ver el sitio con el borrador' }));
    await waitFor(() =>
      expect(screen.queryByText('Estás viendo el borrador, no lo publicado.')).toBeNull(),
    );
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Vi lo nuevo en el teléfono' })).toBeChecked(),
    );
    expect(screen.getByText('Marcada por ana@ug.uchile.cl')).toBeInTheDocument();
  });

  it('signing out leaves the preview', async () => {
    renderApp('/admin/releases', {
      admin: localAdminRepository({ admin: true }),
      api: releaseApi(),
      previewApi: releaseApi(),
    });
    await userEvent.click(
      await screen.findByRole('switch', { name: 'Ver el sitio con el borrador' }),
    );
    expect(
      await screen.findByText('Estás viendo el borrador, no lo publicado.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /tu cuenta$/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Cerrar sesión/ }));
    expect(screen.queryByText('Estás viendo el borrador, no lo publicado.')).toBeNull();
    await waitFor(() => expect(window.sessionStorage.getItem('qv-preview')).toBeNull());
  });

  it('without the preview API (a build that cannot), the switch is off and does nothing', async () => {
    renderApp('/admin/releases', {
      admin: localAdminRepository({ admin: true }),
      api: releaseApi(),
    });
    const toggle = await screen.findByRole('switch', { name: 'Ver el sitio con el borrador' });
    expect(toggle).toBeDisabled();
    await act(async () => {
      toggle.click();
    });
    expect(window.sessionStorage.getItem('qv-preview')).toBeNull();
  });
});
