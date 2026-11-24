// Tests the Anki URLs of a course: a catalog that cannot be read (with «Volver» while studying), the canonical place
// of the screens of a deck in another semester or below an assessment, and the old URLs with a search or a card.
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../../shared/lib/api';
import { fakeApi } from '../../test/fakes/api';
import { CATALOG } from '../../test/fixtures/catalog';
import { DECK_PATH } from '../../test/fixtures/deck';
import { renderApp } from '../../test/render';
import { ankiScreens } from '../ankiScreens';

const COURSE = '/semesters/1/courses/anatomia-1/anki';
const ASSESSMENT = `${COURSE}/certamen-1`;
const WRONG = '/semesters/2/courses/anatomia-1/anki/certamen-1';
const UNIT = 's1-semana-de-prueba/mazo-de-prueba';

afterEach(() => vi.restoreAllMocks());

const where = (r: ReturnType<typeof renderApp>) =>
  r.router.state.location.pathname + r.router.state.location.search;

describe('without the catalog', () => {
  it('studying shows the error with «Volver» to the deck, and «Reintentar» brings the screen', async () => {
    const state = { down: true };
    const api = fakeApi({
      catalog: async () => {
        if (state.down) throw new ApiRequestError(503, 'unavailable', 'El catálogo no llegó.');
        return CATALOG;
      },
    });
    const r = renderApp(`${ASSESSMENT}/study`, { api });
    expect((await screen.findAllByText('El catálogo no llegó.')).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /Anki/ })).toHaveAttribute('href', ASSESSMENT);
    state.down = false;
    await userEvent.click(screen.getAllByRole('button', { name: 'Reintentar' })[0]!);
    await waitFor(() => expect(screen.queryByText('El catálogo no llegó.')).toBeNull());
    expect(where(r)).toBe(`${ASSESSMENT}/study`);
  });
});

describe('the canonical place of a screen', () => {
  it.each([
    [`${WRONG}/review`, `${ASSESSMENT}/review`],
    [WRONG, ASSESSMENT],
    [`${WRONG}/cards?q=hueso`, `${ASSESSMENT}/cards?q=hueso`],
    [`${WRONG}/cards/practice`, `${ASSESSMENT}/cards/practice`],
    [`${WRONG}/stats`, `${ASSESSMENT}/stats`],
  ])('in another semester, %s goes to %s', async (from, to) => {
    const r = renderApp(from);
    await waitFor(() => expect(where(r)).toBe(to));
  });

  it.each([
    ['cards', `${ASSESSMENT}/cards?unit=${encodeURIComponent(UNIT)}`],
    ['cards/practice', `${ASSESSMENT}/cards/practice?unit=${encodeURIComponent(UNIT)}`],
  ])(
    'a deck below an assessment has its %s in the assessment’s, for its unit',
    async (screenPath, to) => {
      const r = renderApp(`${DECK_PATH}/${screenPath}`);
      await waitFor(() => expect(where(r)).toBe(to));
      expect(r.router.state.historyAction).toBe('REPLACE');
    },
  );
});

describe('the old deck URLs', () => {
  const OLD = `${COURSE}/mazo-de-prueba`;

  it('a search goes to the cards with it; a card without its number is the first', async () => {
    const search = renderApp(`${OLD}?q=hueso`);
    await waitFor(() => expect(search.router.state.location.pathname).toBe(`${ASSESSMENT}/cards`));
    const q = new URLSearchParams(search.router.state.location.search);
    expect([q.get('q'), q.get('card'), q.get('unit')]).toEqual(['hueso', null, UNIT]);
    search.unmount();
    const card = renderApp(`${OLD}?note=basic-1`);
    await waitFor(() => expect(card.router.state.location.pathname).toBe(`${ASSESSMENT}/cards`));
    expect(new URLSearchParams(card.router.state.location.search).get('card')).toBe('0:basic-1');
  });
});

describe('fetching the screen’s code', () => {
  it('a chunk that fails while the catalog loads is not the page’s problem', async () => {
    vi.spyOn(ankiScreens.page, 'preload').mockRejectedValue(new Error('chunk'));
    renderApp(ASSESSMENT);
    expect(await screen.findByRole('link', { name: 'Estudiar' })).toBeInTheDocument();
  });
});
