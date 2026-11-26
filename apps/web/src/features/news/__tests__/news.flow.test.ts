// Tests for the news as a student sees them: the bell's dot and menu, the line of the home page and «Novedades» with
// its filter; opening the bell or the page keeps them as seen, and what was new stays marked while it is open.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { Announcement } from '@qv/schema';
import { ApiRequestError } from '../../../shared/lib/api';
import { fakeApi } from '../../../test/fakes/api';
import { renderApp } from '../../../test/render';
import { localNewsRepository } from '../api/repository';
import type { NewsRepository } from '../api/repository';

afterEach(() => window.localStorage.clear());

const news = (
  id: number,
  publishedAt: string,
  items: Announcement['items'] = [],
): Announcement => ({
  id,
  kind: id === 3 ? 'site' : 'new',
  title: `Aviso ${String(id)}`,
  body: id === 2 ? 'Dos clases nuevas.' : '',
  items,
  publishedAt,
});

const FEED = [
  news(3, '2026-11-25T15:00:00.000Z'),
  news(2, '2026-11-24T15:00:00.000Z', [
    { courseId: 'biologia-celular', assessmentId: 'biologia-celular/certamen-2' },
  ]),
  news(1, '2026-11-20T15:00:00.000Z', [{ courseId: 'anatomia-1', assessmentId: null }]),
];

const apiWith = (announcements: Announcement[]) =>
  fakeApi({ news: async () => ({ announcements }) });

const seenAt = async (until: string | null) => {
  const repo = localNewsRepository();
  if (until) await repo.markSeen(until);
  return repo;
};

const bell = () => screen.findByRole('button', { name: /^Novedades/ });

describe('the bell', () => {
  it('has a dot while something is unread; opening it shows the latest and keeps them as seen', async () => {
    const repo: NewsRepository = await seenAt('2026-11-22T00:00:00.000Z');
    renderApp('/home', { api: apiWith(FEED), news: repo });
    const button = await screen.findByRole('button', { name: 'Novedades: hay algo nuevo' });
    expect(screen.getByTestId('news-dot')).not.toHaveClass('hidden');
    await userEvent.click(button);
    const menu = await screen.findByRole('menu');
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual([
      expect.stringMatching(/^Aviso 3 .* Nuevo$/),
      expect.stringMatching(/^Aviso 2 .* Nuevo$/),
      expect.stringMatching(/^Aviso 1 \d+ de noviembre de 2026 $/),
      'Ver todas',
    ]);
    await waitFor(async () => expect(await repo.seenUntil()).toBe('2026-11-25T15:00:00.000Z'));
    expect(screen.getByRole('button', { name: 'Novedades' })).toBeInTheDocument();
    expect(screen.getByTestId('news-dot')).toHaveClass('hidden');
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Ver todas' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Novedades' })).toBeInTheDocument();
  });

  it('without news it says so; while they come, and if they fail, too', async () => {
    renderApp('/home', { api: apiWith([]), news: await seenAt(null) });
    await userEvent.click(await bell());
    expect(await screen.findByText('Al día en tus ramos.')).toBeInTheDocument();
  });

  it('while they come, and if they cannot be read', async () => {
    const never = new Promise<never>(() => undefined);
    const first = renderApp('/home', { api: fakeApi({ news: () => never }) });
    await userEvent.click(await bell());
    expect(await screen.findByText('Cargando las novedades…')).toBeInTheDocument();
    first.unmount();
    renderApp('/home', {
      api: fakeApi({
        news: async () => {
          throw new ApiRequestError(503, 'internal', 'caído');
        },
      }),
    });
    await userEvent.click(await bell());
    expect(await screen.findByText('No se pudieron cargar las novedades.')).toBeInTheDocument();
  });

  it('is not there while studying a deck', async () => {
    renderApp('/semesters/1/courses/anatomia-1/anki/study', { api: apiWith(FEED) });
    expect(await screen.findByRole('button', { name: /tu cuenta/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Novedades/ })).toBeNull();
  });
});

describe('the line of the home page', () => {
  it('says the newest unread and how many more', async () => {
    renderApp('/home', { api: apiWith(FEED), news: await seenAt('2026-11-21T00:00:00.000Z') });
    const line = await screen.findByRole('link', { name: /^Novedades: Nuevo: Aviso 3/ });
    expect(line).toHaveTextContent('Nuevo: Aviso 3 y 1 más');
    expect(line).toHaveAttribute('href', '/news');
  });

  it('one unread is just its title; nothing unread is «Al día en tus ramos»', async () => {
    const one = renderApp('/home', {
      api: apiWith(FEED),
      news: await seenAt('2026-11-24T20:00:00.000Z'),
    });
    expect(
      await screen.findByRole('link', { name: /^Novedades: Nuevo: Aviso 3/ }),
    ).not.toHaveTextContent('más');
    one.unmount();
    renderApp('/home', { api: apiWith(FEED), news: await seenAt('2026-11-25T15:00:00.000Z') });
    expect(
      await screen.findByRole('link', { name: /^Novedades: Al día en tus ramos/ }),
    ).toBeInTheDocument();
  });

  it('what was read cannot be known nor kept: everything counts as unread, and opening the bell keeps showing it', async () => {
    const failing: NewsRepository = {
      seenUntil: () => Promise.reject(new Error('caído')),
      markSeen: () => Promise.resolve(null),
    };
    renderApp('/home', { api: apiWith(FEED), news: failing });
    expect(
      await screen.findByRole('link', { name: /^Novedades: Nuevo: Aviso 3/ }),
    ).toHaveTextContent('y 2 más');
    await userEvent.click(await bell());
    await screen.findByRole('menu');
    await userEvent.keyboard('{Escape}');
    expect(
      await screen.findByRole('link', { name: /^Novedades: Al día en tus ramos/ }),
    ).toBeInTheDocument();
  });
});

describe('«Novedades»', () => {
  it('every announcement by day, with its links; what was new stays marked, and it is kept as seen', async () => {
    const repo = await seenAt('2026-11-22T00:00:00.000Z');
    renderApp('/news', { api: apiWith(FEED), news: repo });
    const first = await screen.findByRole('region', { name: '25 de noviembre de 2026' });
    expect(within(first).getByText('Aviso 3')).toBeInTheDocument();
    expect(within(first).getByText('El sitio')).toBeInTheDocument();
    expect(within(first).getByText('Nuevo')).toBeInTheDocument();
    const second = screen.getByRole('region', { name: '24 de noviembre de 2026' });
    expect(within(second).getByText('Dos clases nuevas.')).toBeInTheDocument();
    expect(
      within(second).getByRole('link', { name: 'Biología celular · Certamen 2' }),
    ).toHaveAttribute('href', '/semesters/2/courses/biologia-celular#certamen-2');
    const third = screen.getByRole('region', { name: '20 de noviembre de 2026' });
    expect(within(third).queryByText('Nuevo')).toBeNull();
    expect(within(third).getByRole('link', { name: 'Anatomía I' })).toBeInTheDocument();
    await waitFor(async () => expect(await repo.seenUntil()).toBe('2026-11-25T15:00:00.000Z'));
    expect(within(first).getByText('Nuevo')).toBeInTheDocument();
  });

  it('filters by course', async () => {
    renderApp('/news', { api: apiWith(FEED), news: await seenAt(null) });
    await userEvent.click(await screen.findByRole('button', { name: 'Ramo: Todos los ramos' }));
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Anatomía I' }));
    expect(screen.getByText('Aviso 1')).toBeInTheDocument();
    expect(screen.queryByText('Aviso 2')).toBeNull();
    expect(screen.queryByText('Aviso 3')).toBeNull();
  });

  it('a course without news, no news at all, and a failure with «Reintentar»', async () => {
    const one = [
      news(1, '2026-11-20T15:00:00.000Z', [{ courseId: 'anatomia-1', assessmentId: null }]),
    ];
    const solo = renderApp('/news', { api: apiWith(one) });
    expect(await screen.findByRole('button', { name: 'Ramo: Todos los ramos' })).toBeDisabled();
    solo.unmount();
    const empty = renderApp('/news', { api: apiWith([]) });
    expect(await screen.findByText('Al día en tus ramos: no hay novedades.')).toBeInTheDocument();
    empty.unmount();
    let fail = true;
    renderApp('/news', {
      api: fakeApi({
        news: async () => {
          if (fail) throw new ApiRequestError(503, 'internal', 'No se pudo.');
          return { announcements: one };
        },
      }),
    });
    fail = true;
    const retry = await screen.findByRole('button', { name: 'Reintentar' });
    fail = false;
    await userEvent.click(retry);
    expect(await screen.findByText('Aviso 1')).toBeInTheDocument();
  });
});
