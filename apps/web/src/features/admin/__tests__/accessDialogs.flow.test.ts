// Tests the popups of «Acceso» at their edges: Escape closes them unless they are working, a form never sends what does
// not match or twice, and each result says only what happened (nobody already there, nothing refused, an empty email).
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test/render';
import { AccessError, localAdminRepository } from '../api/repository';
import type { AccessInvite, AdminRepository, InviteResult, RemoveResult } from '../api/repository';

const admin = (o: Parameters<typeof localAdminRepository>[0] = {}) =>
  localAdminRepository({ admin: true, email: 'dueno@ug.uchile.cl', ...o });

const person = (email: string, list: string, isAdmin = false): AccessInvite => ({
  email,
  list,
  note: null,
  invitedBy: null,
  invitedAt: '2026-11-01T12:00:00.000Z',
  admin: isAdmin,
  hasAccount: false,
  lastSignInAt: null,
});

function pending<T>() {
  let resolve: (v: T) => void = () => undefined;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const confirmField = (dialog: HTMLElement) => within(dialog).getByLabelText(/Para confirmar/);

describe('removing someone', () => {
  it('Escape closes the popup before asking; while removing, neither Escape nor a click outside does, nor a second submit', async () => {
    const repo = admin();
    const answer = pending<RemoveResult>();
    const removeInvites = vi.fn(() => answer.promise);
    renderApp('/admin/access', { admin: { ...repo, removeInvites } });
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const open = await screen.findByRole('button', { name: 'Sacar a luis.soto@ug.uchile.cl' });
    await user.click(open);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await user.click(open);
    const dialog = await screen.findByRole('dialog', { name: 'Sacar a luis.soto@ug.uchile.cl' });
    fireEvent.submit(confirmField(dialog).closest('form')!);
    expect(removeInvites).not.toHaveBeenCalled();
    await user.type(confirmField(dialog), 'luis.soto@ug.uchile.cl');
    await user.click(within(dialog).getByRole('button', { name: 'Sacar' }));
    expect(within(dialog).getByRole('button', { name: 'Sacando…' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    fireEvent.submit(confirmField(dialog).closest('form')!);
    await user.keyboard('{Escape}');
    await user.click(document.body);
    expect(screen.getByRole('dialog', { name: 'Sacar a luis.soto@ug.uchile.cl' })).toBe(dialog);
    expect(removeInvites).toHaveBeenCalledTimes(1);

    await act(async () =>
      answer.resolve({
        removed: ['luis.soto@ug.uchile.cl'],
        keptAdmins: [],
        notInvited: [],
        sessionsClosed: 0,
        openToDomain: true,
      }),
    );
    const done = await screen.findByRole('dialog', { name: 'Listo' });
    expect(done).toHaveTextContent(
      '1 invitación sacada y 0 sesiones cerradas. El sitio está abierto a toda cuenta @ug.uchile.cl: sacar la invitación no quita el acceso.',
    );
  });
});

describe('naming an administrator', () => {
  const people = () => [
    person('dueno@ug.uchile.cl', 'Equipo', true),
    person('ana.perez@ug.uchile.cl', 'Curso'),
    person('otra.admin@ug.uchile.cl', 'Equipo', true),
  ];

  it('a submit with another email does nothing; while saving it says so and does not ask twice', async () => {
    const repo = admin({ invites: people() });
    const answer = pending<Awaited<ReturnType<AdminRepository['setAdmin']>>>();
    const setAdmin = vi.fn(() => answer.promise);
    renderApp('/admin/access', { admin: { ...repo, setAdmin } });
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await user.click(
      await screen.findByRole('button', { name: 'Hacer administrador a ana.perez@ug.uchile.cl' }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.type(confirmField(dialog), 'otra@ug.uchile.cl');
    fireEvent.submit(confirmField(dialog).closest('form')!);
    expect(setAdmin).not.toHaveBeenCalled();
    await user.clear(confirmField(dialog));
    await user.type(confirmField(dialog), 'ana.perez@ug.uchile.cl{Enter}');
    expect(within(dialog).getByRole('button', { name: 'Guardando…' })).toBeDisabled();
    expect(confirmField(dialog)).toBeDisabled();
    fireEvent.submit(confirmField(dialog).closest('form')!);
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(setAdmin).toHaveBeenCalledTimes(1);
    await act(async () =>
      answer.resolve({ email: 'ana.perez@ug.uchile.cl', admin: true, changed: false }),
    );
    expect(await screen.findByRole('dialog', { name: 'Listo' })).toHaveTextContent(
      'ana.perez@ug.uchile.cl ya era administrador.',
    );
  });

  it('removing someone who no longer was says so', async () => {
    const repo = admin({ invites: people() });
    renderApp('/admin/access', {
      admin: {
        ...repo,
        setAdmin: async ({ email }) => ({ email, admin: false, changed: false }),
      },
    });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Quitar administrador a otra.admin@ug.uchile.cl' }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.type(confirmField(dialog), 'otra.admin@ug.uchile.cl{Enter}');
    expect(await screen.findByRole('dialog', { name: 'Listo' })).toHaveTextContent(
      'otra.admin@ug.uchile.cl no era administrador.',
    );
  });
});

describe('inviting', () => {
  const invited = async (result: InviteResult) => {
    const repo = admin();
    renderApp('/admin/access', { admin: { ...repo, invite: async () => result } });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Correos @ug.uchile.cl'), 'a@ug.uchile.cl');
    await user.type(screen.getByLabelText('Nombre de la lista nueva'), 'Nueva');
    await user.click(screen.getByRole('button', { name: 'Invitar' }));
    return screen.findByRole('dialog', { name: 'Invitaciones a «Nueva»' });
  };

  it('with everyone new and nothing refused, it says only how many came in', async () => {
    const dialog = await invited({
      added: ['a@ug.uchile.cl', 'b@ug.uchile.cl'],
      already: [],
      rejected: [],
    });
    expect(within(dialog).getByText(/personas invitadas/)).toHaveTextContent(
      '2 personas invitadas.',
    );
    expect(within(dialog).queryByText(/Rechazados/)).toBeNull();
    expect(within(dialog).queryByText(/Ya estaban/)).toBeNull();
  });

  it('several already there, and a refused email that came empty, said as such', async () => {
    const dialog = await invited({
      added: [],
      already: ['a@ug.uchile.cl', 'b@ug.uchile.cl'],
      rejected: [{ email: '', reason: 'empty' }],
    });
    expect(within(dialog).getByText(/invitadas/)).toHaveTextContent(
      '0 personas invitadas, 2 ya estaban y 1 correo rechazado.',
    );
    expect(within(dialog).getByText('(vacío)')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('a submit that is not ready sends nothing; while inviting it says so and does not send twice', async () => {
    const repo = admin();
    const answer = pending<InviteResult>();
    const invite = vi.fn(() => answer.promise);
    renderApp('/admin/access', { admin: { ...repo, invite } });
    const user = userEvent.setup();
    const emails = await screen.findByLabelText('Correos @ug.uchile.cl');
    fireEvent.submit(emails.closest('form')!);
    expect(invite).not.toHaveBeenCalled();
    await user.type(emails, 'a@ug.uchile.cl');
    await user.type(screen.getByLabelText('Nombre de la lista nueva'), 'Nueva');
    await user.click(screen.getByRole('button', { name: 'Invitar' }));
    expect(screen.getByRole('button', { name: 'Invitando…' })).toBeDisabled();
    fireEvent.submit(emails.closest('form')!);
    expect(invite).toHaveBeenCalledTimes(1);
    await act(async () => answer.resolve({ added: ['a@ug.uchile.cl'], already: [], rejected: [] }));
    expect(
      await screen.findByRole('dialog', { name: 'Invitaciones a «Nueva»' }),
    ).toBeInTheDocument();
  });

  it('a refusal is said in place of the count, as an alert', async () => {
    const repo = admin();
    renderApp('/admin/access', {
      admin: {
        ...repo,
        invite: async () => {
          throw new AccessError('La nota tiene a lo más 200 letras.');
        },
      },
    });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Correos @ug.uchile.cl'), 'a@ug.uchile.cl');
    await user.type(screen.getByLabelText('Nombre de la lista nueva'), 'Nueva');
    await user.click(screen.getByRole('button', { name: 'Invitar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La nota tiene a lo más 200 letras.',
    );
    expect(screen.queryByText(/^1 correo/)).toBeNull();
  });
});

describe('the lists', () => {
  it('nobody invited says so', async () => {
    renderApp('/admin/access', { admin: admin({ invites: [] }) });
    expect(await screen.findByText('Todavía no hay nadie invitado.')).toBeInTheDocument();
  });

  it('a list the counts do not bring counts the people it shows, and nobody with an account', async () => {
    const repo = admin({
      invites: [person('a@ug.uchile.cl', 'Sola'), person('b@ug.uchile.cl', 'Sola')],
    });
    renderApp('/admin/access', {
      admin: {
        ...repo,
        accessReport: async () => ({ ...(await repo.accessReport()), lists: [] }),
      },
    });
    const list = await screen.findByRole('article', { name: 'Lista Sola' });
    expect(within(list).getByText(/invitad/)).toHaveTextContent('2 invitados · 0 con cuenta');
  });

  it('with the whole domain in, the accounts without an invitation do not say they cannot see the material', async () => {
    renderApp('/admin/access', {
      admin: admin({
        openToDomain: true,
        accountsWithoutInvite: [
          {
            email: 'perdida@ug.uchile.cl',
            createdAt: '2026-11-02T10:00:00.000Z',
            lastSignInAt: null,
          },
        ],
      }),
    });
    const strays = (await screen.findByRole('heading', { name: 'Una cuenta sin invitación' }))
      .parentElement!;
    expect(strays).toHaveTextContent('no están en ninguna lista. Invítalas');
    expect(strays).not.toHaveTextContent('no ven el material');
  });
});
