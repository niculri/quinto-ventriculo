// Tests «Ajustes»'s switches for the courses: edit, save at the top, and what the catalog does after.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { SiteSettingsUpdate, SiteSettingsView } from '@qv/schema';
import { fakeApi } from '../../../test/fakes/api';
import { CATALOG } from '../../../test/fixtures/catalog';
import { NO_SETTINGS } from '../../../test/fixtures/siteSettings';
import { renderApp } from '../../../test/render';
import { localAdminRepository } from '../api/repository';

const admin = () => localAdminRepository({ admin: true });

const START: SiteSettingsView = {
  ...NO_SETTINGS,
  semesters: [
    {
      number: 1,
      name: '1° Semestre',
      courses: [
        { id: 'anatomia-1', name: 'Anatomía I', emoji: '🦴', notes: 0, quizzes: 0, cards: 4 },
        { id: 'quimica', name: 'Química', emoji: '⚗️', notes: 1, quizzes: 2, cards: 0 },
        { id: 'vacio', name: 'Vacío', emoji: '📦', notes: 0, quizzes: 0, cards: 0 },
      ],
    },
    {
      number: 2,
      name: '2° Semestre',
      courses: [
        {
          id: 'biologia-celular',
          name: 'Biología celular',
          emoji: '🧬',
          notes: 2,
          quizzes: 1,
          cards: 1,
        },
      ],
    },
  ],
};

function panel(options: { failSave?: boolean } = {}) {
  let settings = START;
  const sent: SiteSettingsUpdate[] = [];
  const catalogCalls: { fresh?: boolean }[] = [];
  const api = fakeApi({
    catalog: async (_signal, o) => {
      catalogCalls.push(o ?? {});
      return CATALOG;
    },
    siteSettings: async () => settings,
    setSiteSettings: async (body) => {
      sent.push(body);
      if (options.failSave) throw new Error('offline');
      settings = {
        ...settings,
        hiddenCourses: body.hiddenCourses ?? settings.hiddenCourses,
        updatedAt: '2026-11-21T15:00:00.000Z',
        updatedBy: 'dueno@ug.uchile.cl',
      };
      return settings;
    },
  });
  return { api, sent, catalogCalls };
}

describe('«Ajustes»: the courses', () => {
  it('lists them by semester with what each one holds, all on', async () => {
    renderApp('/admin/site', { admin: admin(), api: panel().api });
    const bio = await screen.findByRole('switch', { name: 'Biología celular' });
    expect(bio).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Anatomía I' })).toBeChecked();
    const semester = screen.getByRole('group', { name: '2° Semestre' });
    expect(within(semester).getByText('2 apuntes · 1 test · 1 tarjeta')).toBeInTheDocument();
    expect(screen.getByText('4 tarjetas')).toBeInTheDocument();
    expect(screen.getByText('1 apunte · 2 tests')).toBeInTheDocument();
    expect(screen.getByText('Sin material publicado')).toBeInTheDocument();
  });

  it('one course off and another on is still a change to save, even with as many off as before', async () => {
    const { api, sent } = panel();
    renderApp('/admin/site', { admin: admin(), api });
    await userEvent.click(await screen.findByRole('switch', { name: 'Anatomía I' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await screen.findByText('Guardado');
    await userEvent.click(screen.getByRole('switch', { name: 'Anatomía I' }));
    await userEvent.click(screen.getByRole('switch', { name: 'Química' }));
    expect(screen.getByText('Sin guardar')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(sent.at(-1)).toEqual({ hiddenCourses: ['quimica'] }));
  });

  it('a switch changes nothing until «Guardar»; then the list is sent whole and the catalog is read again', async () => {
    const { api, sent, catalogCalls } = panel();
    renderApp('/admin/site', { admin: admin(), api });
    const save = await screen.findByRole('button', { name: 'Guardar' });
    expect(save).toBeDisabled();
    await userEvent.click(
      within(screen.getByRole('group', { name: '1° Semestre' })).getByText(/Anatomía I/),
    );
    expect(screen.getByRole('switch', { name: 'Anatomía I' })).not.toBeChecked();
    expect(screen.getByText('Sin guardar')).toBeInTheDocument();
    expect(sent).toEqual([]);
    await userEvent.click(save);
    expect(await screen.findByText('Guardado')).toBeInTheDocument();
    expect(sent).toEqual([{ hiddenCourses: ['anatomia-1'] }]);
    expect(catalogCalls).toContainEqual({ fresh: true });
    expect(screen.getByRole('switch', { name: 'Anatomía I' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  });

  it('turning it back on before saving leaves nothing to save', async () => {
    renderApp('/admin/site', { admin: admin(), api: panel().api });
    const switchOf = await screen.findByRole('switch', { name: 'Biología celular' });
    await userEvent.click(switchOf);
    await userEvent.click(switchOf);
    expect(switchOf).toBeChecked();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
    expect(screen.queryByText('Sin guardar')).toBeNull();
  });

  it('a save that fails says so and keeps what was edited', async () => {
    renderApp('/admin/site', { admin: admin(), api: panel({ failSave: true }).api });
    const second = await screen.findByRole('group', { name: '2° Semestre' });
    await userEvent.click(within(second).getByText(/Biología celular/));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(
      await screen.findByText('No se pudo guardar los ramos. Inténtalo de nuevo.'),
    ).toHaveAttribute('role', 'alert');
    await waitFor(() => expect(screen.getByText('Sin guardar')).toBeInTheDocument());
    expect(screen.getByRole('switch', { name: 'Biología celular' })).not.toBeChecked();
  });
});
