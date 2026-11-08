import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { SiteSettings } from '@qv/schema';
import { CATALOG, fakeApi, renderApp } from '../../test/render';
import { localAdminRepository } from './repository';

describe('the administration panel', () => {
  it('a student does not see it in the menu, and its URL does not exist for them', async () => {
    const { unmount } = renderApp('/settings/account');
    const menu = await screen.findByRole('navigation', { name: 'Menú del sitio' });
    await waitFor(() => expect(within(menu).getByText('Datos de usuario')).toBeInTheDocument());
    expect(within(menu).queryByText('Panel de administración')).toBeNull();
    unmount();
    renderApp('/settings/admin');
    expect(
      await screen.findByRole('heading', { name: /no aparece ni en el Netter/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Errores reportados en tarjetas')).toBeNull();
  });

  it('an administrator sees it in the menu, with the reports', async () => {
    const admin = localAdminRepository({ admin: true });
    await admin.reportCard({
      noteGuid: 'g',
      ord: 0,
      deckId: null,
      code: 'T-BC-C2-11-086',
      version: 2,
      comment: 'Dice 80S y es 60S',
    });
    renderApp('/settings/admin', { admin });
    expect(await screen.findByText('Dice 80S y es 60S')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'T-BC-C2-11-086.2' })).toBeInTheDocument();
    const menu = screen.getByRole('navigation', { name: 'Menú del sitio' });
    expect(within(menu).getByRole('link', { name: 'Panel de administración' })).toHaveAttribute(
      'href',
      '/settings/admin',
    );
  });

  it('step 1.8: the switch hides the semesters without material, and the catalog is asked for again, fresh', async () => {
    let settings: SiteSettings = { hideEmptySemesters: false, updatedAt: null, updatedBy: null };
    const catalogCalls: { fresh?: boolean }[] = [];
    const api = fakeApi({
      catalog: async (_signal, options = {}) => {
        catalogCalls.push(options);
        return settings.hideEmptySemesters ? { ...CATALOG, hiddenSemesters: 2 } : CATALOG;
      },
      siteSettings: async () => settings,
      setSiteSettings: async ({ hideEmptySemesters }) => {
        settings = {
          hideEmptySemesters,
          updatedAt: '2026-11-07T15:00:00.000Z',
          updatedBy: 'dueno@ug.uchile.cl',
        };
        return settings;
      },
    });
    renderApp('/settings/admin', { admin: localAdminRepository({ admin: true }), api });
    const toggle = await screen.findByRole('switch', {
      name: 'Ocultar los semestres sin contenido',
    });
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
    expect(await screen.findByText(/Cambiado el .* por dueno@ug\.uchile\.cl/)).toBeInTheDocument();
    expect(catalogCalls.at(-1)).toEqual({ fresh: true });
  });

  it('step 1.8, Revisión de cero: saved is saved, even if the catalog does not come right after', async () => {
    let settings: SiteSettings = { hideEmptySemesters: false, updatedAt: null, updatedBy: null };
    const api = fakeApi({
      catalog: async (_signal, options = {}) => {
        if (options.fresh) throw new Error('offline');
        return CATALOG;
      },
      siteSettings: async () => settings,
      setSiteSettings: async ({ hideEmptySemesters }) => {
        settings = {
          hideEmptySemesters,
          updatedAt: '2026-11-07T15:00:00.000Z',
          updatedBy: 'dueno@ug.uchile.cl',
        };
        return settings;
      },
    });
    renderApp('/settings/admin', { admin: localAdminRepository({ admin: true }), api });
    const toggle = await screen.findByRole('switch', {
      name: 'Ocultar los semestres sin contenido',
    });
    await waitFor(() => expect(toggle).toBeEnabled());
    await userEvent.click(toggle);
    expect(await screen.findByText(/Cambiado el .* por dueno@ug\.uchile\.cl/)).toBeInTheDocument();
    expect(toggle).toBeChecked();
    expect(screen.queryByText('No se pudo guardar. Inténtalo de nuevo.')).toBeNull();
  });

  it('step 1.8: «Inicio» says that the hidden semesters are coming, in their place', async () => {
    renderApp('/home', {
      api: fakeApi({ catalog: async () => ({ ...CATALOG, hiddenSemesters: 12 }) }),
    });
    // In the page, and in the menu where the semesters are listed.
    const main = await screen.findByRole('main');
    expect(
      await within(main).findByText('Los próximos semestres vienen pronto.'),
    ).toBeInTheDocument();
    const menu = screen.getByRole('navigation', { name: 'Menú del sitio' });
    expect(within(menu).getByText('Los próximos semestres vienen pronto.')).toBeInTheDocument();
  });
});
