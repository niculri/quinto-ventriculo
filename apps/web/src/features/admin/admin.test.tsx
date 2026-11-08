import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { SiteSettings, UnpublishedLog } from '@qv/schema';
import { CATALOG, fakeApi, renderApp } from '../../test/render';
import { localAdminRepository } from './repository';
import type { AdminRepository } from './repository';
import { readEmails } from './AccessPage';

const admin = (o: Parameters<typeof localAdminRepository>[0] = {}) =>
  localAdminRepository({ admin: true, email: 'dueno@ug.uchile.cl', ...o });

describe('«Administración» (step 2.10): its own page, apart from «Opciones»', () => {
  it('a student does not see it in either menu, and none of its URLs exist for them', async () => {
    const { unmount } = renderApp('/settings/account');
    const menu = await screen.findByRole('navigation', { name: 'Menú del sitio' });
    await waitFor(() => expect(within(menu).getByText('Datos de usuario')).toBeInTheDocument());
    expect(within(menu).queryByText(/Administración|Publicaciones/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Tu cuenta' }));
    expect(await screen.findByRole('menuitem', { name: /Opciones/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Administración/ })).toBeNull();
    unmount();
    for (const url of [
      '/admin',
      '/admin/releases',
      '/admin/reports',
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
      expect(screen.queryByText('Errores reportados en tarjetas')).toBeNull();
      expect(
        screen.queryByRole('navigation', { name: 'Secciones de la administración' }),
      ).toBeNull();
      r.unmount();
    }
  });

  it('an administrator gets to it from the account menu: /admin opens «Publicaciones»', async () => {
    const { router } = renderApp('/home', { admin: admin() });
    await userEvent.click(await screen.findByRole('button', { name: 'Tu cuenta' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Administración/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/releases'));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Administración' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Publicaciones' }),
    ).toBeInTheDocument();
    const sections = [
      ['Publicaciones', '/admin/releases'],
      ['Reportes', '/admin/reports'],
      ['Acceso', '/admin/access'],
      ['Sitio', '/admin/site'],
      ['Fuera del sitio', '/admin/unpublished'],
    ];
    const own = screen.getByRole('navigation', { name: 'Secciones de la administración' });
    expect(
      within(own)
        .getAllByRole('link')
        .map((l) => [l.textContent?.trim(), l.getAttribute('href')]),
    ).toEqual(sections);
    // The site's menu has them too (on wide screens the page's goes away).
    const menu = screen.getByRole('navigation', { name: 'Menú del sitio' });
    for (const [label, href] of sections) {
      expect(within(menu).getByRole('link', { name: label })).toHaveAttribute('href', href);
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

  it('«Reportes»: the errors reported in the cards', async () => {
    const repo = admin();
    await repo.reportCard({
      noteGuid: 'g',
      ord: 0,
      deckId: null,
      code: 'T-BC-C2-11-086',
      version: 2,
      comment: 'Dice 80S y es 60S',
    });
    renderApp('/admin/reports', { admin: repo });
    expect(await screen.findByText('Dice 80S y es 60S')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Reportes' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'T-BC-C2-11-086.2' })).toBeInTheDocument();
  });

  it('step 1.8 («Sitio»): the switch hides the semesters without material, and the catalog is asked for again, fresh', async () => {
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
    renderApp('/admin/site', { admin: admin(), api });
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

describe('«Acceso» (step 2.10)', () => {
  it('splits what is pasted by lines, commas, semicolons and spaces', () => {
    expect(
      readEmails(' a@ug.uchile.cl,b@ug.uchile.cl\n\n c@ug.uchile.cl ; d@ug.uchile.cl e@x '),
    ).toEqual({
      emails: ['a@ug.uchile.cl', 'b@ug.uchile.cl', 'c@ug.uchile.cl', 'd@ug.uchile.cl', 'e@x'],
      ignored: 0,
    });
  });

  it('Revisión de cero (2.10), con el dueño: of «Nombre Apellido <correo>» only the email, never the name', () => {
    // As Gmail copies them (also «"Apellido, Nombre" <…>», whose comma does not separate), and a mailing list.
    expect(
      readEmails(
        'Ana Pérez <ana.perez@ug.uchile.cl>, "Soto, Luis" <Luis.Soto@ug.uchile.cl>\n' +
          'Rosa Díaz <rosa.diaz@ug.uchile.cl>; otra@ug.uchile.cl\n' +
          'mailto:alguien@ug.uchile.cl <dos@ug.uchile.cl, tres@ug.uchile.cl>',
      ),
    ).toEqual({
      emails: [
        'ana.perez@ug.uchile.cl',
        'Luis.Soto@ug.uchile.cl',
        'rosa.diaz@ug.uchile.cl',
        'otra@ug.uchile.cl',
        'alguien@ug.uchile.cl',
        'dos@ug.uchile.cl',
        'tres@ug.uchile.cl',
      ],
      ignored: 6,
    });
    // An unclosed quote does not swallow the emails after it; an unclosed «<» still gives its email.
    expect(readEmails('Ana "Pérez <ana@ug.uchile.cl>, "Luis" <luis@ug.uchile.cl>')).toEqual({
      emails: ['ana@ug.uchile.cl', 'luis@ug.uchile.cl'],
      ignored: 3,
    });
    expect(readEmails('Rosa Díaz <rosa@ug.uchile.cl')).toEqual({
      emails: ['rosa@ug.uchile.cl'],
      ignored: 2,
    });
    // An email written without its «@» is not sent either: it is counted, so that it is noticed.
    expect(readEmails('ana.perez.ug.uchile.cl')).toEqual({ emails: [], ignored: 1 });
  });

  it('Revisión de cero (2.10), con el dueño: the names pasted never reach the database', async () => {
    const calls: { emails: string[] }[] = [];
    const repo = admin();
    renderApp('/admin/access', {
      admin: {
        ...repo,
        invite: async (input) => {
          calls.push(input);
          return repo.invite(input);
        },
      },
    });
    const emails = await screen.findByLabelText('Correos @ug.uchile.cl');
    await userEvent.click(emails);
    await userEvent.paste(
      'Rosa Díaz <rosa.diaz@ug.uchile.cl>, "Pérez, Ana" <ana.perez@ug.uchile.cl>\nOtra Persona <otra@gmail.com>',
    );
    expect(screen.getByText('3 correos (6 palabras no son correos)')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Nombre de la lista nueva'), 'Medicina 2027');
    await userEvent.click(screen.getByRole('button', { name: 'Invitar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Invitaciones a «Medicina 2027»' });
    expect(calls).toEqual([
      {
        emails: ['rosa.diaz@ug.uchile.cl', 'ana.perez@ug.uchile.cl', 'otra@gmail.com'],
        list: 'Medicina 2027',
        note: null,
      },
    ]);
    expect(dialog).toHaveTextContent('1 persona invitada, 1 ya estaba y 1 correo rechazado.');
    for (const name of ['Rosa', 'Díaz', 'Pérez', 'Otra', 'Persona']) {
      expect(dialog).not.toHaveTextContent(name);
    }
  });

  it('shows who comes in, by list, with the accounts without an invitation on top', async () => {
    renderApp('/admin/access', {
      admin: admin({
        accountsWithoutInvite: [
          {
            email: 'perdida@ug.uchile.cl',
            createdAt: '2026-11-02T10:00:00.000Z',
            lastSignInAt: null,
          },
        ],
      }),
    });
    expect(
      await screen.findByRole('heading', { name: 'Una cuenta sin invitación' }),
    ).toBeInTheDocument();
    expect(screen.getByText('perdida@ug.uchile.cl')).toBeInTheDocument();
    expect(screen.getByText(/Solo las cuentas invitadas: 3 en 2 listas/)).toBeInTheDocument();
    const course = screen.getByRole('article', { name: 'Lista Curso de prueba' });
    expect(course).toHaveTextContent('2 invitados · 1 con cuenta');
    expect(within(course).getByText('luis.soto@ug.uchile.cl')).toBeInTheDocument();
    expect(within(course).getByText(/todavía sin cuenta/)).toBeInTheDocument();
    // An administrator has no «Sacar».
    const team = screen.getByRole('article', { name: 'Lista Equipo' });
    expect(within(team).getByText('Administrador')).toBeInTheDocument();
    expect(within(team).queryByRole('button', { name: /^Sacar a / })).toBeNull();
    // Revisión de cero (2.10), con el dueño: a list of only administrators has no «Sacar la lista» (it would take out
    // nobody); a list with someone else in it has.
    expect(within(team).queryByRole('button', { name: 'Sacar la lista' })).toBeNull();
    expect(within(course).getByRole('button', { name: 'Sacar la lista' })).toBeInTheDocument();
  });

  it('with the whole domain in, it says so (it is not changed here)', async () => {
    renderApp('/admin/access', { admin: admin({ openToDomain: true }) });
    expect(
      await screen.findByText(/Cualquier cuenta @ug\.uchile\.cl, invitada o no/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('invites into a new list, and says who came in, who was already there and what was refused', async () => {
    const calls: unknown[] = [];
    const repo = admin();
    const spy: AdminRepository = {
      ...repo,
      invite: async (input) => {
        calls.push(input);
        return repo.invite(input);
      },
    };
    renderApp('/admin/access', { admin: spy });
    const emails = await screen.findByLabelText('Correos @ug.uchile.cl');
    const invite = screen.getByRole('button', { name: 'Invitar' });
    expect(invite).toBeDisabled();
    await userEvent.type(
      emails,
      'Nueva.Persona@UG.uchile.cl, ana.perez@ug.uchile.cl{Enter}alguien@gmail.com{Enter}nueva.persona@ug.uchile.cl',
    );
    expect(screen.getByText('4 correos')).toBeInTheDocument();
    // A new list needs its name.
    expect(invite).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Nombre de la lista nueva'), 'Medicina 2027');
    await userEvent.type(screen.getByLabelText(/Nota/), 'Primera tanda');
    await userEvent.click(invite);
    const dialog = await screen.findByRole('dialog', { name: 'Invitaciones a «Medicina 2027»' });
    expect(dialog).toHaveTextContent('1 persona invitada, 1 ya estaba y 2 correos rechazados.');
    expect(dialog).toHaveTextContent('nueva.persona@ug.uchile.cl');
    expect(dialog).toHaveTextContent('alguien@gmail.com · no es @ug.uchile.cl');
    expect(dialog).toHaveTextContent('nueva.persona@ug.uchile.cl · repetido en lo pegado');
    expect(calls).toEqual([
      {
        emails: [
          'Nueva.Persona@UG.uchile.cl',
          'ana.perez@ug.uchile.cl',
          'alguien@gmail.com',
          'nueva.persona@ug.uchile.cl',
        ],
        list: 'Medicina 2027',
        note: 'Primera tanda',
      },
    ]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Listo' }));
    // The list is there now, and the form stays on it for the next ones.
    const list = await screen.findByRole('article', { name: 'Lista Medicina 2027' });
    expect(within(list).getByText(/Primera tanda/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lista: Medicina 2027' })).toBeInTheDocument();
    expect(screen.getByLabelText('Correos @ug.uchile.cl')).toHaveValue('');
  });

  it('more than 500 emails at once: it says so, and does not send them', async () => {
    renderApp('/admin/access', { admin: admin() });
    const emails = await screen.findByLabelText('Correos @ug.uchile.cl');
    await userEvent.click(emails);
    await userEvent.paste(Array.from({ length: 501 }, (_, i) => `p${i}@ug.uchile.cl`).join('\n'));
    expect(screen.getByText('Son 501 correos: a lo más 500 por vez.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Nombre de la lista nueva'), 'Muchos');
    expect(screen.getByRole('button', { name: 'Invitar' })).toBeDisabled();
  });

  it('removing a person asks to write their email; then says what was done', async () => {
    renderApp('/admin/access', { admin: admin() });
    await userEvent.click(
      await screen.findByRole('button', { name: 'Sacar a luis.soto@ug.uchile.cl' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Sacar a luis.soto@ug.uchile.cl' });
    const go = within(dialog).getByRole('button', { name: 'Sacar' });
    expect(go).toBeDisabled();
    await userEvent.type(
      within(dialog).getByLabelText(/Para confirmar/),
      'Luis.Soto@ug.uchile.cl ',
    );
    await userEvent.click(go);
    const done = await screen.findByRole('dialog', { name: 'Listo' });
    expect(done).toHaveTextContent('1 invitación sacada y 1 sesión cerrada.');
    await userEvent.click(within(done).getByRole('button', { name: 'Listo' }));
    await waitFor(() => expect(screen.queryByText('luis.soto@ug.uchile.cl')).toBeNull());
  });

  it('removing a whole list never takes out an administrator: they stay, with the reason', async () => {
    const repo = admin({
      invites: [
        {
          email: 'dueno@ug.uchile.cl',
          list: 'Equipo',
          note: null,
          invitedBy: null,
          invitedAt: '2026-11-01T12:00:00.000Z',
          admin: true,
          hasAccount: true,
          lastSignInAt: null,
        },
        {
          email: 'ayudante@ug.uchile.cl',
          list: 'Equipo',
          note: null,
          invitedBy: null,
          invitedAt: '2026-11-01T12:00:00.000Z',
          admin: false,
          hasAccount: false,
          lastSignInAt: null,
        },
      ],
    });
    renderApp('/admin/access', { admin: repo });
    await userEvent.click(await screen.findByRole('button', { name: 'Sacar la lista' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sacar la lista «Equipo»' });
    // It counts only who goes (never the administrator).
    expect(dialog).toHaveTextContent('Se borra 1 invitación y se cierran sus sesiones');
    await userEvent.type(within(dialog).getByLabelText(/Para confirmar/), 'Equip');
    expect(within(dialog).getByRole('button', { name: 'Sacar la lista' })).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/Para confirmar/), 'o');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sacar la lista' }));
    const done = await screen.findByRole('dialog', { name: 'Listo' });
    expect(done).toHaveTextContent('Salieron (1)');
    expect(done).toHaveTextContent('ayudante@ug.uchile.cl');
    expect(done).toHaveTextContent('Se mantuvo (1) · es administrador');
    expect(done).toHaveTextContent('dueno@ug.uchile.cl');
    expect((await repo.accessReport()).invited.map((i) => i.email)).toEqual(['dueno@ug.uchile.cl']);
  });

  it('Revisión de cero (2.10): a list removed while chosen in the form stays in the Select (it was empty)', async () => {
    renderApp('/admin/access', { admin: admin() });
    await userEvent.click(await screen.findByRole('button', { name: 'Lista: Lista nueva' }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Curso de prueba' }));
    expect(screen.getByRole('button', { name: 'Lista: Curso de prueba' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre de la lista nueva')).toBeDisabled();
    const course = screen.getByRole('article', { name: 'Lista Curso de prueba' });
    await userEvent.click(within(course).getByRole('button', { name: 'Sacar la lista' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sacar la lista «Curso de prueba»' });
    await userEvent.type(within(dialog).getByLabelText(/Para confirmar/), 'Curso de prueba');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sacar la lista' }));
    const done = await screen.findByRole('dialog', { name: 'Listo' });
    await userEvent.click(within(done).getByRole('button', { name: 'Listo' }));
    await waitFor(() =>
      expect(screen.queryByRole('article', { name: 'Lista Curso de prueba' })).toBeNull(),
    );
    // What the next invitation would use is what the Select says.
    expect(screen.getByRole('button', { name: 'Lista: Curso de prueba' })).toBeInTheDocument();
  });

  it('a failure of the database is said in the popup, which stays open', async () => {
    const repo = admin();
    renderApp('/admin/access', {
      admin: {
        ...repo,
        removeInvites: async () => {
          throw new Error('offline');
        },
      },
    });
    await userEvent.click(
      await screen.findByRole('button', { name: 'Sacar a luis.soto@ug.uchile.cl' }),
    );
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/Para confirmar/), 'luis.soto@ug.uchile.cl');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sacar' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'No se pudo. Revisa tu conexión e intenta de nuevo.',
    );
    expect(
      screen.getByRole('dialog', { name: 'Sacar a luis.soto@ug.uchile.cl' }),
    ).toBeInTheDocument();
  });
});

describe('«Fuera del sitio» (step 2.10)', () => {
  const LOG: UnpublishedLog = {
    total: 3,
    entries: [
      {
        id: 3,
        kind: 'note',
        itemId: 'AP-XX-01',
        title: 'Artículo de prueba',
        reason: 'Otra vez fuera',
        by: 'dueño',
        doneAt: '2026-11-07T12:00:00.000Z',
        removed: { notes: 1, sections: 3 },
        onSite: false,
      },
      {
        id: 2,
        kind: 'deck',
        itemId: '123',
        title: 'Mazo de prueba',
        reason: 'Tarjetas repetidas',
        by: 'dueño',
        doneAt: '2026-11-06T12:00:00.000Z',
        removed: { decks: 2, ankiNotes: 10, cards: 15 },
        onSite: true,
      },
      {
        id: 1,
        kind: 'note',
        itemId: 'AP-XX-01',
        title: 'Artículo de prueba',
        reason: 'Figura con un error',
        by: 'dueño',
        doneAt: '2026-11-05T12:00:00.000Z',
        removed: { notes: 1, sections: 3 },
        onSite: false,
      },
    ],
  };

  it('what is off now (the latest entry of each piece) and the whole record, only to look at', async () => {
    renderApp('/admin/unpublished', {
      admin: admin(),
      api: fakeApi({ unpublishedLog: async () => LOG }),
    });
    const now = await screen.findByRole('region', { name: 'Ahora fuera del sitio' });
    expect(within(now).getAllByRole('listitem')).toHaveLength(1);
    expect(now).toHaveTextContent('Otra vez fuera');
    expect(now).toHaveTextContent('3 secciones');
    const log = screen.getByRole('region', { name: 'Registro' });
    expect(within(log).getAllByRole('listitem')).toHaveLength(3);
    expect(log).toHaveTextContent('Volvió al sitio');
    expect(log).toHaveTextContent('2 mazos · 10 notas · 15 tarjetas');
    expect(within(now).queryByRole('button')).toBeNull();
    expect(within(log).queryByRole('button')).toBeNull();
  });

  it('nothing taken off', async () => {
    renderApp('/admin/unpublished', {
      admin: admin(),
      api: fakeApi({ unpublishedLog: async () => ({ total: 0, entries: [] }) }),
    });
    expect(await screen.findByText('Nunca se ha sacado nada del sitio.')).toBeInTheDocument();
    expect(screen.getByText('No hay nada fuera del sitio.')).toBeInTheDocument();
  });
});
