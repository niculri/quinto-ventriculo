// Tests where the old browser's URLs go: the cards of their deck's search (with the card open), of their card's
// deck, or the home page; and what it shows while it reads or when the catalog fails.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fakeApi } from '../../../../test/fakes/api';
import { CATALOG } from '../../../../test/fixtures/catalog';
import { renderApp } from '../../../../test/render';
import { ApiRequestError } from '../../../../shared/lib/api';

const PAGE = '/semesters/1/courses/anatomia-1/anki/certamen-1/cards';
const DECK =
  '"deck:() Medicina UCH::1° Semestre::🦴 Anatomía I::Certamen 1::S1 - Semana de prueba::Mazo de prueba"';
const where = (router: { state: { location: { pathname: string; search: string } } }) => ({
  path: router.state.location.pathname,
  params: Object.fromEntries(new URLSearchParams(router.state.location.search)),
});

describe('LegacyBrowse', () => {
  it('without a search nor a card goes home', async () => {
    const { router } = renderApp('/anki/browse');
    await waitFor(() => expect(router.state.location.pathname).toBe('/home'));
  });

  it('a deck’s search with a card keeps the rest of the search and opens the card', async () => {
    const { router } = renderApp(
      `/anki/browse?q=${encodeURIComponent(`${DECK} is:new`)}&note=cloze-1&ord=1`,
    );
    await waitFor(() => expect(router.state.location.pathname).toBe(PAGE));
    expect(where(router).params).toEqual({
      unit: 's1-semana-de-prueba/mazo-de-prueba',
      q: 'is:new',
      card: '1:cloze-1',
    });
  });

  it('a card without a search goes to its deck’s cards, first card when the URL has no number', async () => {
    const { router } = renderApp('/anki/browse?note=cloze-1');
    await waitFor(() => expect(router.state.location.pathname).toBe(PAGE));
    expect(where(router).params.card).toBe('0:cloze-1');
  });

  it('waits for the card the URL names, and a card that does not exist goes home', async () => {
    const fail: ((e: Error) => void)[] = [];
    const api = fakeApi({ card: () => new Promise((_, reject) => fail.push(reject)) });
    const { router } = renderApp('/anki/browse?note=gone&ord=0', { api });
    await waitFor(() => expect(fail).toHaveLength(1));
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/anki/browse');
    fail[0]!(new ApiRequestError(404, 'not_found', 'Esa tarjeta no existe.'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/home'));
  });

  it('a catalog it could not read says so, and «Reintentar» reads it again and goes on', async () => {
    let fail = true;
    const api = fakeApi({
      catalog: async () => {
        if (fail) throw new ApiRequestError(500, 'internal', 'Falló la red.');
        return CATALOG;
      },
    });
    const { router } = renderApp('/anki/browse?note=cloze-1&ord=0', { api });
    const retry = await screen.findByRole('button', { name: 'Reintentar' });
    fail = false;
    await userEvent.click(retry);
    await waitFor(() => expect(router.state.location.pathname).toBe(PAGE));
  });
});
