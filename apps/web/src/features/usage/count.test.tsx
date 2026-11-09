import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { UsageOpenRequest } from '@qv/schema';
import { DECK_PATH, QUIZ, fakeApi, fullAnkiStudy, renderApp } from '../../test/render';
import { forgetLastSearch } from './count';

/**
 * Step 2.9: «Uso» counts a note, a deck or a test only when the page that opens it does (the note's page, a deck's page
 * or its study, a test's cover or a round), never when another page reads the same thing («Hoy en Anki», «Ponte a
 * prueba»); and a search once, when it is completed, never each text typed.
 */

function spyApi() {
  const sent: UsageOpenRequest[] = [];
  const read: string[] = [];
  const api = fakeApi({
    usageOpen: async (body) => {
      sent.push(body);
      return { ok: true as const };
    },
  });
  const quiz = api.quiz;
  api.quiz = async (id, signal) => {
    read.push(`quiz:${id}`);
    return quiz(id, signal);
  };
  return { api, sent, read };
}

const ARTICLE = '/semesters/2/courses/biologia-celular/notes/11-traduccion';
const settle = () => new Promise((r) => setTimeout(r, 300));

beforeEach(() => forgetLastSearch());

describe('what is opened (step 2.9)', () => {
  it('a note counts once, and its «Ponte a prueba» (which reads the test) does not count the test', async () => {
    const { api, sent, read } = spyApi();
    renderApp(ARTICLE, { api });
    await screen.findByRole('heading', { level: 1, name: 'Traducción' });
    await waitFor(() => expect(read).toContain(`quiz:${QUIZ.id}`));
    await settle();
    expect(sent).toEqual([{ kind: 'note', id: '11-traduccion' }]);
  });

  it('the home page counts nothing', async () => {
    const { api, sent } = spyApi();
    renderApp('/home', { api, study: fullAnkiStudy() });
    await screen.findByRole('heading', { name: 'Hola, Ana' });
    await settle();
    expect(sent).toEqual([]);
  });

  it('a deck’s page counts the deck once', async () => {
    const { api, sent } = spyApi();
    renderApp(DECK_PATH, { api, study: fullAnkiStudy() });
    await waitFor(() => expect(sent.length).toBeGreaterThan(0));
    await settle();
    // A deck inside a week goes on to its assessment's page: that one is the deck opened.
    expect(sent).toEqual([{ kind: 'deck', id: '4' }]);
  });

  it('studying a deck counts it once', async () => {
    const { api, sent } = spyApi();
    renderApp(`${DECK_PATH}/study`, { api, study: fullAnkiStudy() });
    await waitFor(() => expect(sent.length).toBeGreaterThan(0));
    await settle();
    expect(sent).toEqual([{ kind: 'deck', id: '20' }]);
  });

  it('from the home page, «Estudiar» counts the deck (already read by «Hoy en Anki»)', async () => {
    const { api, sent } = spyApi();
    renderApp('/home', { api, study: fullAnkiStudy() });
    const today = await screen.findByRole('region', { name: 'Hoy en Anki' });
    await userEvent.click(await within(today).findByRole('link', { name: /^Estudiar/ }));
    await screen.findByRole('button', { name: 'Mostrar respuesta' });
    await settle();
    expect(sent).toEqual([{ kind: 'deck', id: '3' }]);
  });

  it('a deck’s page, then its study and back: the same open (10 minutes); another deck counts', async () => {
    const { api, sent } = spyApi();
    const { router } = renderApp(DECK_PATH, { api, study: fullAnkiStudy() });
    await waitFor(() => expect(sent).toEqual([{ kind: 'deck', id: '4' }]));
    const deckPage = router.state.location.pathname;
    await router.navigate(`${deckPage}/study`);
    await screen.findByRole('button', { name: 'Mostrar respuesta' });
    await router.navigate(-1);
    await waitFor(() => expect(router.state.location.pathname).toBe(deckPage));
    await settle();
    expect(sent).toEqual([{ kind: 'deck', id: '4' }]);
    await router.navigate(`${DECK_PATH}/study`);
    await screen.findByRole('button', { name: 'Mostrar respuesta' });
    await settle();
    expect(sent).toEqual([
      { kind: 'deck', id: '4' },
      { kind: 'deck', id: '20' },
    ]);
  });

  it('a test’s cover counts the test once', async () => {
    const { api, sent } = spyApi();
    renderApp('/semesters/2/courses/biologia-celular/tests/certamen-2/practica', { api });
    await waitFor(() => expect(sent.length).toBeGreaterThan(0));
    await settle();
    expect(sent).toEqual([{ kind: 'quiz', id: QUIZ.id }]);
  });

  it('a search typed letter by letter counts once, when a result is opened, and the same search again does not', async () => {
    const { api, sent } = spyApi();
    const { router } = renderApp('/home', { api });
    await screen.findByRole('heading', { name: 'Hola, Ana' });
    await userEvent.keyboard('{Meta>}k{/Meta}');
    const box = await screen.findByRole('combobox', { name: 'Buscar en la página' });
    for (const letter of 'subunid') {
      await userEvent.type(box, letter);
      // Longer than the palette waits: every text is asked for.
      await new Promise((r) => setTimeout(r, 260));
    }
    expect(await screen.findByText('subunidades')).toBeInTheDocument();
    expect(sent).toEqual([]);
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(router.state.location.pathname).toMatch(/11-traduccion$/));
    const searches = () => sent.filter((s) => s.kind === 'search');
    expect(searches()).toEqual([{ kind: 'search', from: 'home' }]);
    // The same text, opened again from the palette on the note: the same search.
    await userEvent.keyboard('{Meta>}k{/Meta}');
    await userEvent.type(
      await screen.findByRole('combobox', { name: 'Buscar en la página' }),
      'subunid',
    );
    expect(await screen.findByText('subunidades')).toBeInTheDocument();
    await userEvent.keyboard('{Enter}');
    await settle();
    expect(searches()).toEqual([{ kind: 'search', from: 'home' }]);
  });

  it('the results page counts on Enter or a result, not while typing', async () => {
    const { api, sent } = spyApi();
    renderApp('/search', { api });
    const box = await screen.findByRole('searchbox', { name: 'Buscar en todos los apuntes' });
    await userEvent.type(box, 'ribosomas');
    expect(await screen.findByText('1 sección en 1 apunte')).toBeInTheDocument();
    await settle();
    expect(sent).toEqual([]);
    await userEvent.click(screen.getByRole('link', { name: 'Traducción' }));
    expect(sent).toEqual([{ kind: 'search', from: 'search' }]);
  });
});
