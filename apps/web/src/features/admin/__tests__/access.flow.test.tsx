// Tests «Acceso»: what is pasted, who is invited, inviting, removing, and naming and removing administrators.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../../test/render';
import { AccessError, localAdminRepository } from '../api/repository';
import type { AccessInvite, AdminRepository } from '../api/repository';

const admin = (o: Parameters<typeof localAdminRepository>[0] = {}) =>
  localAdminRepository({ admin: true, email: 'dueno@ug.uchile.cl', ...o });

describe('«Acceso»', () => {
  it('the names pasted never reach the database', async () => {
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
    const team = screen.getByRole('article', { name: 'Lista Equipo' });
    expect(within(team).getByText('Administrador')).toBeInTheDocument();
    expect(within(team).queryByRole('button', { name: /^Sacar a / })).toBeNull();
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

  it('a list removed while chosen in the form stays in the Select', async () => {
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

describe('«Acceso»: administrators', () => {
  const people = (): AccessInvite[] => [
    person('dueno@ug.uchile.cl', 'Equipo', true),
    person('segunda.admin@ug.uchile.cl', 'Equipo', true),
    person('ana.perez@ug.uchile.cl', 'Curso de prueba', false),
  ];
  function person(email: string, list: string, isAdmin: boolean): AccessInvite {
    return {
      email,
      list,
      note: null,
      invitedBy: null,
      invitedAt: '2026-11-01T12:00:00.000Z',
      admin: isAdmin,
      hasAccount: true,
      lastSignInAt: null,
    };
  }

  it('the site owner sees «Hacer administrador» and «Quitar administrador»; never on their own row', async () => {
    renderApp('/admin/access', { admin: admin({ invites: people() }) });
    const team = await screen.findByRole('article', { name: 'Lista Equipo' });
    expect(within(team).getByText('Dueño')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Quitar administrador a dueno@ug.uchile.cl' }),
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Quitar administrador a segunda.admin@ug.uchile.cl' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Hacer administrador a ana.perez@ug.uchile.cl' }),
    ).toBeInTheDocument();
  });

  it('another administrator uses the panel, but sees none of those buttons', async () => {
    renderApp('/admin/access', {
      admin: admin({ email: 'segunda.admin@ug.uchile.cl', owner: false, invites: people() }),
    });
    expect(
      await screen.findByRole('button', { name: 'Sacar a ana.perez@ug.uchile.cl' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /administrador a / })).toBeNull();
  });

  it('naming asks to write the email; then the row says «Administrador», without «Sacar»', async () => {
    const calls: unknown[] = [];
    const repo = admin({ invites: people() });
    renderApp('/admin/access', {
      admin: {
        ...repo,
        setAdmin: async (input) => {
          calls.push(input);
          return repo.setAdmin(input);
        },
      },
    });
    await userEvent.click(
      await screen.findByRole('button', { name: 'Hacer administrador a ana.perez@ug.uchile.cl' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Hacer administrador a ana.perez@ug.uchile.cl',
    });
    expect(dialog).toHaveTextContent('No puede nombrar ni quitar administradores');
    expect(dialog).toHaveTextContent('la próxima vez que abra o recargue el sitio');
    const go = within(dialog).getByRole('button', { name: 'Hacer administrador' });
    expect(go).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/Para confirmar/), 'ana.perez@ug.uchile.c');
    expect(go).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/Para confirmar/), 'L ');
    await userEvent.click(go);
    const done = await screen.findByRole('dialog', { name: 'Listo' });
    expect(done).toHaveTextContent('ana.perez@ug.uchile.cl ya es administrador.');
    expect(calls).toEqual([{ email: 'ana.perez@ug.uchile.cl', admin: true }]);
    await userEvent.click(within(done).getByRole('button', { name: 'Listo' }));
    const course = screen.getByRole('article', { name: 'Lista Curso de prueba' });
    await waitFor(() => expect(within(course).getByText('Administrador')).toBeInTheDocument());
    expect(within(course).queryByRole('button', { name: /^Sacar/ })).toBeNull();
    expect(
      within(course).getByRole('button', {
        name: 'Quitar administrador a ana.perez@ug.uchile.cl',
      }),
    ).toBeInTheDocument();
  });

  it('removing says it can take up to a minute; then they can be removed like anybody invited', async () => {
    renderApp('/admin/access', { admin: admin({ invites: people() }) });
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Quitar administrador a segunda.admin@ug.uchile.cl',
      }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Quitar administrador a segunda.admin@ug.uchile.cl',
    });
    expect(dialog).toHaveTextContent('Sigue invitado, con su cuenta, su avance y sus sesiones.');
    expect(dialog).toHaveTextContent('Deja de poder cambiar cosas de inmediato');
    expect(dialog).toHaveTextContent('hasta un minuto');
    await userEvent.type(
      within(dialog).getByLabelText(/Para confirmar/),
      'segunda.admin@ug.uchile.cl',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Quitar administrador' }));
    const done = await screen.findByRole('dialog', { name: 'Listo' });
    expect(done).toHaveTextContent(
      'segunda.admin@ug.uchile.cl ya no es administrador. Ya no puede cambiar nada;',
    );
    await userEvent.click(within(done).getByRole('button', { name: 'Listo' }));
    expect(
      await screen.findByRole('button', { name: 'Sacar a segunda.admin@ug.uchile.cl' }),
    ).toBeInTheDocument();
  });

  it('a refusal of the database is said in the popup, which stays open', async () => {
    const repo = admin({ invites: people() });
    renderApp('/admin/access', {
      admin: {
        ...repo,
        setAdmin: async () => {
          throw new AccessError('Primero tiene que estar invitado. Recarga la página.');
        },
      },
    });
    await userEvent.click(
      await screen.findByRole('button', { name: 'Hacer administrador a ana.perez@ug.uchile.cl' }),
    );
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/Para confirmar/), 'ana.perez@ug.uchile.cl');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Hacer administrador' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Primero tiene que estar invitado.',
    );
    expect(
      screen.getByRole('dialog', { name: 'Hacer administrador a ana.perez@ug.uchile.cl' }),
    ).toBeInTheDocument();
  });

  it('the demo repository refuses as the database does', async () => {
    const owner = admin({ invites: people() });
    await expect(owner.setAdmin({ email: 'dueno@ug.uchile.cl', admin: false })).rejects.toThrow(
      'Al dueño del sitio no se le quita.',
    );
    await expect(owner.setAdmin({ email: 'nadie@ug.uchile.cl', admin: true })).rejects.toThrow(
      'Primero tiene que estar invitado.',
    );
    const other = admin({ email: 'segunda.admin@ug.uchile.cl', owner: false, invites: people() });
    await expect(other.setAdmin({ email: 'ana.perez@ug.uchile.cl', admin: true })).rejects.toThrow(
      'Solo el dueño del sitio',
    );
  });
});
