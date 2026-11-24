// Tests «Mover a otra lista» in «Acceso»: choosing one person or a whole list, moving to an existing or a new list,
// undoing at once, and what is said when the database refuses.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../../test/render';
import { AccessError, localAdminRepository } from '../api/repository';
import type { AccessInvite } from '../api/repository';

const person = (email: string, list: string): AccessInvite => ({
  email,
  list,
  note: null,
  invitedBy: 'dueno@ug.uchile.cl',
  invitedAt: '2026-11-01T12:00:00.000Z',
  admin: false,
  hasAccount: false,
  lastSeenAt: null,
});
const COURSE = Array.from({ length: 30 }, (_, i) => person(`alumno${i}@ug.uchile.cl`, 'Curso'));
const invites = () => [
  { ...person('dueno@ug.uchile.cl', 'Equipo'), admin: true, hasAccount: true },
  ...COURSE,
];
const admin = () =>
  localAdminRepository({ admin: true, email: 'dueno@ug.uchile.cl', invites: invites() });

const list = (name: string) => screen.getByRole('article', { name: `Lista ${name}` });

describe('«Mover a otra lista»', () => {
  it('nothing chosen: «Mover» and «Deshacer» are there but cannot be used', async () => {
    renderApp('/admin/access', { admin: admin() });
    const bar = await screen.findByRole('region', { name: 'Mover a otra lista' });
    expect(bar).toHaveTextContent('Elige personas con las casillas');
    expect(within(bar).getByRole('button', { name: 'Mover' })).toBeDisabled();
    expect(within(bar).getByRole('button', { name: 'Deshacer' })).toBeDisabled();
  });

  it('moves 30 people of a whole list to a new one in one step, and undoes it', async () => {
    const repo = admin();
    const calls: { email: string; list: string }[][] = [];
    renderApp('/admin/access', {
      admin: {
        ...repo,
        moveInvites: async (moves) => {
          calls.push(moves);
          return repo.moveInvites(moves);
        },
      },
    });
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Elegir a todos en Curso' }));
    const bar = screen.getByRole('region', { name: 'Mover a otra lista' });
    expect(bar).toHaveTextContent('30 personas elegidas');
    await userEvent.click(within(bar).getByRole('button', { name: /^Lista de destino/ }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Lista nueva' }));
    await userEvent.type(
      within(bar).getByLabelText('Nombre de la nueva lista de destino'),
      'Ayudantes',
    );
    await userEvent.click(within(bar).getByRole('button', { name: 'Mover' }));
    expect(await screen.findByText('30 personas pasaron a «Ayudantes».')).toBeInTheDocument();
    expect(calls[0]).toHaveLength(30);
    expect(calls[0]!.every((m) => m.list === 'Ayudantes')).toBe(true);
    expect(await screen.findByRole('article', { name: 'Lista Ayudantes' })).toHaveTextContent(
      '30 invitados',
    );
    expect(screen.queryByRole('article', { name: 'Lista Curso' })).toBeNull();
    expect(bar).toHaveTextContent('Elige personas con las casillas');
    expect(within(bar).getByRole('button', { name: 'Lista de destino: Ayudantes' })).toBeVisible();

    await userEvent.click(within(bar).getByRole('button', { name: 'Deshacer' }));
    expect(
      await screen.findByText('Deshecho: 30 personas volvieron a su lista.'),
    ).toBeInTheDocument();
    expect(calls[1]!.every((m) => m.list === 'Curso')).toBe(true);
    expect(await screen.findByRole('article', { name: 'Lista Curso' })).toHaveTextContent(
      '30 invitados',
    );
    expect(within(bar).getByRole('button', { name: 'Deshacer' })).toBeDisabled();
  });

  it('one person to an existing list; the list box shows some chosen', async () => {
    renderApp('/admin/access', { admin: admin() });
    await userEvent.click(
      await screen.findByRole('checkbox', { name: 'Elegir a alumno3@ug.uchile.cl' }),
    );
    const all = within(list('Curso')).getByRole('checkbox', { name: 'Elegir a todos en Curso' });
    expect((all as HTMLInputElement).indeterminate).toBe(true);
    const bar = screen.getByRole('region', { name: 'Mover a otra lista' });
    await userEvent.click(within(bar).getByRole('button', { name: /^Lista de destino/ }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Equipo' }));
    await userEvent.click(within(bar).getByRole('button', { name: 'Mover' }));
    expect(await screen.findByText('1 persona pasó a «Equipo».')).toBeInTheDocument();
    await waitFor(() =>
      expect(within(list('Equipo')).getByText('alumno3@ug.uchile.cl')).toBeInTheDocument(),
    );
    expect(list('Curso')).toHaveTextContent('29 invitados');
  });

  it('choosing all and unchoosing all of a list', async () => {
    renderApp('/admin/access', { admin: admin() });
    const all = await screen.findByRole('checkbox', { name: 'Elegir a todos en Curso' });
    await userEvent.click(all);
    expect(all).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Elegir a alumno0@ug.uchile.cl' })).toBeChecked();
    await userEvent.click(all);
    expect(all).not.toBeChecked();
    expect(screen.getByRole('region', { name: 'Mover a otra lista' })).toHaveTextContent(
      'Elige personas con las casillas',
    );
  });

  it('a refusal of the database stays in the bar, and nothing moves', async () => {
    const repo = admin();
    renderApp('/admin/access', {
      admin: {
        ...repo,
        moveInvites: async () => {
          throw new AccessError('Solo para administradores.');
        },
      },
    });
    await userEvent.click(
      await screen.findByRole('checkbox', { name: 'Elegir a alumno1@ug.uchile.cl' }),
    );
    const bar = screen.getByRole('region', { name: 'Mover a otra lista' });
    await userEvent.click(within(bar).getByRole('button', { name: 'Mover' }));
    expect(await within(bar).findByRole('alert')).toHaveTextContent('Solo para administradores.');
    expect(list('Curso')).toHaveTextContent('30 invitados');
    expect(within(bar).getByRole('button', { name: 'Deshacer' })).toBeDisabled();
  });

  it('while it moves, the button says so and the boxes wait', async () => {
    const repo = admin();
    let finish: () => void = () => undefined;
    renderApp('/admin/access', {
      admin: {
        ...repo,
        moveInvites: async (moves) => {
          await new Promise<void>((resolve) => {
            finish = resolve;
          });
          return repo.moveInvites(moves);
        },
      },
    });
    const box = await screen.findByRole('checkbox', { name: 'Elegir a alumno4@ug.uchile.cl' });
    await userEvent.click(box);
    const bar = screen.getByRole('region', { name: 'Mover a otra lista' });
    await userEvent.click(within(bar).getByRole('button', { name: 'Mover' }));
    expect(await within(bar).findByRole('button', { name: 'Moviendo…' })).toBeDisabled();
    expect(box).toBeDisabled();
    finish();
    expect(await screen.findByText('Ya estaban en «Curso».')).toBeInTheDocument();
  });

  it('moving whoever was already there says so, and leaves nothing to undo', async () => {
    renderApp('/admin/access', { admin: admin() });
    await userEvent.click(
      await screen.findByRole('checkbox', { name: 'Elegir a alumno2@ug.uchile.cl' }),
    );
    const bar = screen.getByRole('region', { name: 'Mover a otra lista' });
    expect(within(bar).getByRole('button', { name: 'Lista de destino: Curso' })).toBeVisible();
    await userEvent.click(within(bar).getByRole('button', { name: 'Mover' }));
    expect(await screen.findByText('Ya estaban en «Curso».')).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Deshacer' })).toBeDisabled();
  });
});
