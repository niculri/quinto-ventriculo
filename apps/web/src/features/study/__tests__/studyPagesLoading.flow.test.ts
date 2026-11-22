// Tests the study screen and the final review while what they need does not come: a deck that does not exist, one
// that fails to load, study data that fails, a card gone or failing, and a session that stopped.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeApi } from '../../../test/fakes/api';
import { fullAnkiStudy } from '../../../test/fakes/repositories';
import { renderApp } from '../../../test/render';
import { ApiRequestError } from '../../../shared/lib/api';
import { cardText } from '../../../test/dom';
import { CardChangedError } from '../../progress/api/repository';

const ASSESSMENT = '/semesters/1/courses/anatomia-1/anki/certamen-1';
const PAGES = [
  [
    'the study screen',
    `${ASSESSMENT}/study`,
    () => screen.findByRole('button', { name: /Mostrar respuesta/ }),
  ],
  [
    'the final review',
    `${ASSESSMENT}/review`,
    () => screen.findByRole('heading', { name: /Repaso final/ }),
  ],
] as const;

function deckFailing(status: number) {
  let fail = true;
  const base = fakeApi();
  const api = fakeApi({
    deck: async (id) => {
      if (fail) throw new ApiRequestError(status, status === 404 ? 'not_found' : 'internal', 'No.');
      return base.deck(id);
    },
  });
  return { api, recover: () => (fail = false) };
}

describe.each(PAGES)('%s when its deck does not come', (_, path, shown) => {
  it.each([400, 404])('a deck answered %i does not exist: the page not found', async (status) => {
    renderApp(path, { study: fullAnkiStudy(), api: deckFailing(status).api });
    expect(
      await screen.findByRole('heading', { name: 'Esta página no aparece ni en el Netter' }),
    ).toBeInTheDocument();
  });

  it('a deck that fails offers «Reintentar» and the way back, and then the page', async () => {
    const { api, recover } = deckFailing(500);
    renderApp(path, { study: fullAnkiStudy(), api });
    const retry = await screen.findByRole('button', { name: 'Reintentar' });
    expect(screen.getByRole('link', { name: /Certamen 1/ })).toHaveAttribute('href', ASSESSMENT);
    recover();
    await userEvent.click(retry);
    expect(await shown()).toBeInTheDocument();
  });

  it('study data that fails offers «Reintentar», and then the page', async () => {
    const study = fullAnkiStudy();
    const cards = study.cards.bind(study);
    let fail = true;
    study.cards = (ids) => (fail ? Promise.reject(new Error('sin red')) : cards(ids));
    renderApp(path, { study });
    const retry = await screen.findByRole('button', { name: 'Reintentar' });
    fail = false;
    await userEvent.click(retry);
    expect(await shown()).toBeInTheDocument();
  });
});

describe('a card of the study screen', () => {
  const FIRST = 's@/AqX%n?#';
  function cardFailing(status: number) {
    let fail = true;
    const base = fakeApi();
    const api = fakeApi({
      card: async (guid, ord) => {
        if (fail && guid === FIRST) throw new ApiRequestError(status, 'internal', 'No.');
        return base.card(guid, ord);
      },
    });
    return { api, recover: () => (fail = false) };
  }

  it('one no longer on the site is skipped, and the next one shows', async () => {
    renderApp(`${ASSESSMENT}/study`, { study: fullAnkiStudy(), api: cardFailing(404).api });
    expect(await cardText(/Frente/)).toContain('La columna tiene');
  });

  it('one that fails offers «Reintentar» in its place, and can be reported meanwhile', async () => {
    const { api, recover } = cardFailing(500);
    renderApp(`${ASSESSMENT}/study`, { study: fullAnkiStudy(), api });
    const retry = await screen.findByRole('button', { name: 'Reintentar' });
    await userEvent.click(screen.getByRole('button', { name: 'Más' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Reportar error' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reportar error' });
    await userEvent.type(within(dialog).getByLabelText('¿Qué está mal?'), 'No carga');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('Gracias: tu reporte le llegó al autor.')).toBeInTheDocument();
    recover();
    await userEvent.click(retry);
    expect(await cardText(/Frente/)).toContain('¿Cuántas vértebras');
  });
});

describe('a session that stopped', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('says why and loads the page again with «Volver a cargar»', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { href: window.location.href, reload });
    const study = fullAnkiStudy();
    study.recordReview = () => Promise.reject(new CardChangedError());
    renderApp(`${ASSESSMENT}/study`, { study });
    await cardText(/Frente/);
    await userEvent.click(screen.getByRole('button', { name: /Mostrar respuesta/ }));
    await userEvent.click(await screen.findByRole('button', { name: /^Bien/ }));
    const button = await screen.findByRole('button', { name: 'Volver a cargar' });
    expect(screen.getByText('Se detuvo la sesión')).toBeInTheDocument();
    await userEvent.click(button);
    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
  });
});
