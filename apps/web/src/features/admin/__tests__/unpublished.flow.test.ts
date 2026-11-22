// Tests «Fuera del sitio»: what is off the site now and the whole record, only to look at.
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { UnpublishedLog } from '@qv/schema';
import { ApiRequestError } from '../../../shared/lib/api';
import { fakeApi } from '../../../test/fakes/api';
import { renderApp } from '../../../test/render';
import { localAdminRepository } from '../api/repository';

const admin = (o: Parameters<typeof localAdminRepository>[0] = {}) =>
  localAdminRepository({ admin: true, email: 'dueno@ug.uchile.cl', ...o });

describe('«Fuera del sitio»', () => {
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

  it('an entry that took nothing says only when and who', async () => {
    renderApp('/admin/unpublished', {
      admin: admin(),
      api: fakeApi({
        unpublishedLog: async () => ({
          total: 1,
          entries: [{ ...LOG.entries[0]!, removed: {} }],
        }),
      }),
    });
    const log = await screen.findByRole('region', { name: 'Registro' });
    const line = within(log).getByText(/ · dueño/);
    expect(line.textContent).toMatch(/ · dueño$/);
  });

  it('when the record does not come, «Reintentar» asks again', async () => {
    let fails = true;
    renderApp('/admin/unpublished', {
      admin: admin(),
      api: fakeApi({
        unpublishedLog: async () => {
          if (fails) throw new ApiRequestError(503, 'unavailable', 'Sin conexión de prueba.');
          return LOG;
        },
      }),
    });
    const retry = await screen.findByRole('button', { name: 'Reintentar' });
    fails = false;
    await userEvent.click(retry);
    expect(await screen.findByRole('region', { name: 'Registro' })).toHaveTextContent(
      'Otra vez fuera',
    );
  });
});
