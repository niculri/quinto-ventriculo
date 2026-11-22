// Tests the redirects from old URLs: a catalog that cannot be read says so with «Reintentar» (and then redirects), and
// an old deck URL that does not end in a page of a course is a 404.
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '../../shared/lib/api';
import { fakeApi } from '../../test/fakes/api';
import { CATALOG } from '../../test/fixtures/catalog';
import { renderApp } from '../../test/render';

function flakyCatalog() {
  const state = { down: true };
  const api = fakeApi({
    catalog: async () => {
      if (state.down) throw new ApiRequestError(503, 'unavailable', 'El catálogo no llegó.');
      return CATALOG;
    },
  });
  return { api, state };
}

describe('the old URLs', () => {
  it.each([
    ['/courses/anatomia-1', '/semesters/1/courses/anatomia-1'],
    ['/notes/11-traduccion', '/semesters/2/courses/biologia-celular/notes/11-traduccion'],
    ['/decks/20', '/semesters/1/courses/anatomia-1/anki/certamen-1'],
  ])('%s without the catalog says so, and «Reintentar» goes on to %s', async (from, to) => {
    const { api, state } = flakyCatalog();
    const { router } = renderApp(from, { api });
    const retry = (await screen.findAllByRole('button', { name: 'Reintentar' }))[0]!;
    expect(screen.getAllByText('El catálogo no llegó.').length).toBeGreaterThan(0);
    state.down = false;
    await userEvent.click(retry);
    await waitFor(() => expect(router.state.location.pathname).toBe(to));
  });

  it.each(['/decks/no-existe', '/decks/1', '/decks/2'])(
    '%s, not a deck or a deck without a page of its course, is a 404',
    async (url) => {
      renderApp(url);
      expect(await screen.findByText('Esta página no aparece ni en el Netter')).toBeInTheDocument();
    },
  );

  it('an old deck URL with a subdeck goes to the subdeck, and a week, which has no page, to its certamen', async () => {
    const { router } = renderApp('/decks/4?subdeck=s1-semana-de-prueba');
    const visited: string[] = [];
    router.subscribe((state) => visited.push(state.location.pathname));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/semesters/1/courses/anatomia-1/anki/certamen-1',
      ),
    );
    expect(visited).toContain(
      '/semesters/1/courses/anatomia-1/anki/certamen-1/s1-semana-de-prueba',
    );
  });

  it('an old deck URL with a subdeck that does not exist goes to the deck', async () => {
    const { router } = renderApp('/decks/20?subdeck=no-existe');
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/semesters/1/courses/anatomia-1/anki/certamen-1',
      ),
    );
  });
});
