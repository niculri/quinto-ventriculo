// Tests «Administración» as a whole: who sees it, its menus and sections, the old URLs, «Reportes» and «Ajustes».
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { SiteSettingsView } from '@qv/schema';
import { fakeApi } from '../../../test/fakes/api';
import { CATALOG } from '../../../test/fixtures/catalog';
import { NO_SETTINGS } from '../../../test/fixtures/siteSettings';
import { renderApp } from '../../../test/render';
import { localAdminRepository } from '../api/repository';
import { localReportsRepository } from '../../reports/api/repository';
import { cardTarget } from '../../reports/model/targets';

const admin = (o: Parameters<typeof localAdminRepository>[0] = {}) =>
  localAdminRepository({ admin: true, email: 'dueno@ug.uchile.cl', ...o });

describe('«Administración»: its own page, apart from «Opciones»', () => {
  it('a student does not see it in either menu, and none of its URLs exist for them', async () => {
    const { unmount } = renderApp('/settings/account');
    const menu = await screen.findByRole('navigation', { name: 'Menú del sitio' });
    await waitFor(() => expect(within(menu).getByText('Datos de usuario')).toBeInTheDocument());
    expect(within(menu).queryByText(/Administración|Publicaciones/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /tu cuenta$/i }));
    expect(await screen.findByRole('menuitem', { name: /Opciones/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Administración/ })).toBeNull();
    unmount();
    for (const url of [
      '/admin',
      '/admin/releases',
      '/admin/reports',
      '/admin/usage',
      '/admin/cards',
      '/admin/access',
      '/admin/site',
      '/admin/unpublished',
      '/settings/admin',
      '/settings/admin/releases',
    ]) {
      const r = renderApp(url);
      expect(
        await screen.findByRole('heading', { name: /no aparece ni en el Netter/ }),
      ).toBeInTheDocument();
      expect(screen.queryByText('Errores reportados')).toBeNull();
      expect(
        screen.queryByRole('navigation', { name: 'Secciones de la administración' }),
      ).toBeNull();
      r.unmount();
    }
  });

  it('an administrator gets to it from the account menu: /admin opens «Publicaciones»', async () => {
    const { router } = renderApp('/home', { admin: admin() });
    await userEvent.click(await screen.findByRole('button', { name: /tu cuenta$/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Administración/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/releases'));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Administración' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Publicaciones' }),
    ).toBeInTheDocument();
    const groups: [string, [string, string][]][] = [
      [
        'Contenido',
        [
          ['Publicaciones', '/admin/releases'],
          ['Anuncios', '/admin/announcements'],
          ['Fuera del sitio', '/admin/unpublished'],
        ],
      ],
      [
        'Alumnos',
        [
          ['Acceso', '/admin/access'],
          ['Reportes', '/admin/reports'],
        ],
      ],
      [
        'Estadísticas',
        [
          ['Uso', '/admin/usage'],
          ['Tarjetas', '/admin/cards'],
        ],
      ],
      ['Sitio', [['Ajustes', '/admin/site']]],
    ];
    const linksOf = (group: HTMLElement) =>
      within(group)
        .getAllByRole('link')
        .map((l) => [l.textContent.trim(), l.getAttribute('href')]);
    // The same groups, always open, in the page's own menu and in the site's.
    for (const nav of [
      screen.getByRole('navigation', { name: 'Secciones de la administración' }),
      screen.getByRole('navigation', { name: 'Menú del sitio' }),
    ]) {
      for (const [title, links] of groups) {
        expect(linksOf(within(nav).getByRole('group', { name: title }))).toEqual(links);
      }
    }
  });

  it('«Opciones» is only the account and Anki now, also for an administrator', async () => {
    renderApp('/settings/account', { admin: admin() });
    const nav = await screen.findByRole('navigation', { name: 'Secciones de las opciones' });
    expect(within(nav).queryByText(/Administración|Publicaciones|Panel/)).toBeNull();
  });

  it('the old URLs inside «Opciones» go to their section', async () => {
    const a = renderApp('/settings/admin', { admin: admin() });
    await waitFor(() => expect(a.router.state.location.pathname).toBe('/admin/reports'));
    a.unmount();
    const b = renderApp('/settings/admin/releases', { admin: admin() });
    await waitFor(() => expect(b.router.state.location.pathname).toBe('/admin/releases'));
  });

  it('«Reportes»: the errors reported, by content', async () => {
    const reports = localReportsRepository({ admin: true });
    await reports.send({
      ...cardTarget({
        noteGuid: 'g',
        ord: 0,
        deckId: null,
        code: 'T-BC-C2-11-086',
        version: 2,
      }),
      category: 'fact',
      comment: 'Dice 80S y es 60S',
    });
    renderApp('/admin/reports', { admin: admin(), reports });
    expect(await screen.findByText('Dice 80S y es 60S')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Reportes' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'T-BC-C2-11-086.2' })).toBeInTheDocument();
  });

  it('«Ajustes»: the switch hides the semesters without material, and the catalog is asked for again, fresh', async () => {
    let settings: SiteSettingsView = { ...NO_SETTINGS };
    const catalogCalls: { fresh?: boolean }[] = [];
    const api = fakeApi({
      catalog: async (_signal, options?: { fresh?: boolean }) => {
        catalogCalls.push(options ?? {});
        return settings.hideEmptySemesters ? { ...CATALOG, hiddenSemesters: 2 } : CATALOG;
      },
      siteSettings: async () => settings,
      setSiteSettings: async ({ hideEmptySemesters }) => {
        settings = {
          ...settings,
          hideEmptySemesters: hideEmptySemesters ?? settings.hideEmptySemesters,
          updatedAt: '2026-11-07T15:00:00.000Z',
          updatedBy: 'dueno@ug.uchile.cl',
        };
        return settings;
      },
    });
    renderApp('/admin/site', { admin: admin(), api });
    const toggle = await screen.findByRole('switch', {
      name: 'Ocultar los semestres sin contenido',
    });
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
    expect(await screen.findByText(/Cambiado el .* por dueno@ug\.uchile\.cl/)).toBeInTheDocument();
    expect(catalogCalls).toContainEqual({ fresh: true });
  });

  it('«Ajustes»: saved is saved, even if the catalog does not come right after', async () => {
    let settings: SiteSettingsView = { ...NO_SETTINGS };
    const api = fakeApi({
      catalog: async (_signal, options?: { fresh?: boolean }) => {
        if (options?.fresh) throw new Error('offline');
        return CATALOG;
      },
      siteSettings: async () => settings,
      setSiteSettings: async ({ hideEmptySemesters }) => {
        settings = {
          ...settings,
          hideEmptySemesters: hideEmptySemesters ?? settings.hideEmptySemesters,
          updatedAt: '2026-11-07T15:00:00.000Z',
          updatedBy: 'dueno@ug.uchile.cl',
        };
        return settings;
      },
    });
    renderApp('/admin/site', { admin: admin(), api });
    const toggle = await screen.findByRole('switch', {
      name: 'Ocultar los semestres sin contenido',
    });
    await waitFor(() => expect(toggle).toBeEnabled());
    await userEvent.click(toggle);
    expect(await screen.findByText(/Cambiado el .* por dueno@ug\.uchile\.cl/)).toBeInTheDocument();
    expect(toggle).toBeChecked();
    expect(screen.queryByText('No se pudo guardar. Inténtalo de nuevo.')).toBeNull();
  });

  it('«La carrera» says that the hidden semesters are coming, in their place', async () => {
    renderApp('/courses', {
      api: fakeApi({ catalog: async () => ({ ...CATALOG, hiddenSemesters: 12 }) }),
    });
    const main = await screen.findByRole('main');
    expect(
      await within(main).findByText('Los próximos semestres vienen pronto.'),
    ).toBeInTheDocument();
    const menu = screen.getByRole('navigation', { name: 'Menú del sitio' });
    expect(within(menu).getByText('Los próximos semestres vienen pronto.')).toBeInTheDocument();
  });
});
