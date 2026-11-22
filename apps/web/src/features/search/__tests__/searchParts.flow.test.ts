// Characterizes the quick search and the search page: what each says before, without and with results, on an error,
// and the text nodes of its lines.
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { SearchResponse, SearchResult } from '@qv/schema';
import { ApiRequestError } from '../../../shared/lib/api';
import { fakeApi } from '../../../test/fakes/api';
import { renderApp } from '../../../test/render';
import { textNodes } from '../../../test/dom';

const result = (over: Partial<SearchResult>): SearchResult => ({
  noteId: 'AP-BC-C2-11',
  noteSlug: '11-traduccion',
  noteTitle: 'Traducción',
  courseName: 'Biología celular',
  anchor: 'ribosomas',
  section: 'Ribosomas',
  snippet: 'Tienen dos ⟦subunidades⟧.',
  score: 1,
  ...over,
});

const answering = (results: SearchResult[]) =>
  fakeApi({ search: async (query): Promise<SearchResponse> => ({ query, results }) });

async function openPalette() {
  const user = userEvent.setup();
  renderApp('/home');
  await screen.findByRole('heading', { name: 'Hola, Ana' });
  await user.keyboard('{Meta>}k{/Meta}');
  return { user, box: await screen.findByRole('combobox', { name: 'Buscar en la página' }) };
}

describe('the quick search', () => {
  it('asks for two letters, then lists the results with their note and offers to see all', async () => {
    const { user, box } = await openPalette();
    const dialog = screen.getByRole('dialog', { name: 'Buscar en la página' });
    expect(within(dialog).getByText('Escribe al menos dos letras.')).toBeInTheDocument();
    expect(box).toHaveAttribute('placeholder', 'Busca un concepto: nucléolo, splicing, GPCR…');
    expect(within(dialog).getByText('Esc')).toBeInTheDocument();
    await user.type(box, 'ri');
    const list = await within(dialog).findByRole('listbox', { name: 'Resultados' });
    const option = await within(list).findByRole('option');
    expect(textNodes(option.querySelector('p')!)).toEqual(['Ribosomas', ' · ', 'Traducción']);
    expect(option).toHaveAttribute('aria-selected', 'true');
    const all = within(dialog).getByRole('button', { name: 'Ver todos los resultados' });
    expect(textNodes(all)).toEqual(['Ver todos los resultados']);
  });

  it('says when nothing matched', async () => {
    const user = userEvent.setup();
    renderApp('/home', { api: answering([]) });
    await screen.findByRole('heading', { name: 'Hola, Ana' });
    await user.keyboard('{Meta>}k{/Meta}');
    await user.type(await screen.findByRole('combobox', { name: 'Buscar en la página' }), 'zzz');
    const nothing = await screen.findByText(/^Nada para/);
    expect(textNodes(nothing)).toEqual([
      'Nada para «',
      'zzz',
      '». Prueba con otra palabra o sin abreviaturas.',
    ]);
  });

  it('«Ver todos los resultados» opens the search page', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/home');
    await screen.findByRole('heading', { name: 'Hola, Ana' });
    await user.keyboard('{Meta>}k{/Meta}');
    await user.type(await screen.findByRole('combobox', { name: 'Buscar en la página' }), 'ribo');
    await user.click(await screen.findByRole('button', { name: 'Ver todos los resultados' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/search'));
    expect(router.state.location.search).toBe('?q=ribo');
  });
});

describe('choosing a result with the mouse', () => {
  it('a click opens its note at its section, and the mouse over another selects it', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/home', {
      api: answering([result({}), result({ anchor: 'polisomas', section: 'Polisomas' })]),
    });
    await screen.findByRole('heading', { name: 'Hola, Ana' });
    await user.keyboard('{Meta>}k{/Meta}');
    await user.type(await screen.findByRole('combobox', { name: 'Buscar en la página' }), 'ri');
    const options = await screen.findAllByRole('option');
    await user.hover(options[1]!);
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    expect(options[0]).toHaveAttribute('aria-selected', 'false');
    await user.click(options[1]!);
    await waitFor(() => expect(router.state.location.hash).toBe('#polisomas'));
    expect(router.state.location.pathname).toMatch(/\/notes\/11-traduccion$/);
  });
});

describe('the search page', () => {
  const main = () => within(screen.getByRole('main'));

  it('before typing, says how to search', async () => {
    renderApp('/search');
    expect(
      await screen.findByText(
        'Busca por concepto, estructura o proceso. No importan los acentos ni las mayúsculas, y basta con el comienzo de la palabra: «transcrip» encuentra «transcripción».',
      ),
    ).toBeInTheDocument();
    expect(main().getByRole('searchbox', { name: 'Buscar en todos los apuntes' })).toHaveAttribute(
      'placeholder',
      'Busca en todos los apuntes',
    );
    expect(main().getByRole('heading', { level: 1 })).toHaveTextContent('Buscar');
  });

  it('counts the sections and the notes in their own text nodes, and lists each note with its course', async () => {
    renderApp('/search?q=ribo', {
      api: answering([
        result({}),
        result({ anchor: 'sitios', section: 'Sitios' }),
        result({
          noteId: 'AP-BC-C2-10',
          noteSlug: '10-nucleo-celular',
          noteTitle: 'Núcleo celular',
        }),
      ]),
    });
    const count = await screen.findByText(/secciones en/);
    expect(textNodes(count)).toEqual(['3', ' ', 'secciones', ' en ', '2', ' ', 'apuntes']);
    expect(main().getAllByText('Biología celular')).toHaveLength(2);
    expect(main().getByRole('link', { name: /^Sitios/ })).toHaveAttribute(
      'href',
      '/semesters/2/courses/biologia-celular/notes/11-traduccion#sitios',
    );
  });

  it('without results, says what to try and links the career', async () => {
    renderApp('/search?q=zzz', { api: answering([]) });
    expect(
      await screen.findByText(
        'Nada para «zzz». Prueba con el comienzo de la palabra, con otro nombre de la estructura o sin abreviaturas.',
      ),
    ).toBeInTheDocument();
    expect(main().getByRole('link', { name: 'Ver toda la carrera' })).toHaveAttribute(
      'href',
      '/courses',
    );
  });

  it('when the search fails, says so with the reason', async () => {
    renderApp('/search?q=ribo', {
      api: fakeApi({
        search: async () => {
          throw new ApiRequestError(500, 'internal', 'Falló de prueba.');
        },
      }),
    });
    expect(await screen.findByText('No se pudo buscar')).toBeInTheDocument();
  });
});

describe('the quick search by keyboard', () => {
  const three = [
    result({}),
    result({ anchor: 'sitios', section: 'Sitios' }),
    result({ anchor: 'tRNA', section: 'ARN de transferencia' }),
  ];
  const selected = () =>
    screen
      .getAllByRole('option')
      .map((o, i) => (o.getAttribute('aria-selected') === 'true' ? i : -1))
      .filter((i) => i >= 0);

  it('the arrows stop at both ends and typing goes back to the first result', async () => {
    const user = userEvent.setup();
    renderApp('/home', { api: answering(three) });
    await screen.findByRole('heading', { name: 'Hola, Ana' });
    await user.keyboard('{Meta>}k{/Meta}');
    const box = await screen.findByRole('combobox', { name: 'Buscar en la página' });
    await user.type(box, 'ri');
    await screen.findAllByRole('option');
    expect(selected()).toEqual([0]);
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(selected()).toEqual([2]);
    expect(box).toHaveAttribute('aria-activedescendant', 'palette-result-2');
    await user.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}');
    expect(selected()).toEqual([0]);
    await user.keyboard('{ArrowDown}');
    expect(selected()).toEqual([1]);
    await user.type(box, 'b');
    expect(selected()).toEqual([0]);
    await user.hover(screen.getAllByRole('option')[2]!);
    expect(selected()).toEqual([2]);
  });

  it('Enter opens the selected result, or all the results when there is none, and does nothing without text', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/home', { api: answering(three) });
    await screen.findByRole('heading', { name: 'Hola, Ana' });
    await user.keyboard('{Meta>}k{/Meta}');
    const box = await screen.findByRole('combobox', { name: 'Buscar en la página' });
    await user.keyboard('{Enter}');
    expect(router.state.location.pathname).toBe('/home');
    expect(box).toBeInTheDocument();
    await user.type(box, 'ri');
    await screen.findAllByRole('option');
    await user.keyboard('{ArrowDown}{Enter}');
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/semesters/2/courses/biologia-celular/notes/11-traduccion',
      ),
    );
    expect(router.state.location.hash).toBe('#sitios');
    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull());
  });

  it('Enter with a text nothing matched goes to the search page', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/home', { api: answering([]) });
    await screen.findByRole('heading', { name: 'Hola, Ana' });
    await user.keyboard('{Meta>}k{/Meta}');
    await user.type(await screen.findByRole('combobox', { name: 'Buscar en la página' }), 'zzz');
    await screen.findByText(/^Nada para/);
    await user.keyboard('{Enter}');
    await waitFor(() => expect(router.state.location.pathname).toBe('/search'));
    expect(router.state.location.search).toBe('?q=zzz');
  });

  it('asks the API once the typing stops, with the trimmed text, never for a single letter and for 8 results', async () => {
    const asked: [string, number][] = [];
    const api = fakeApi({
      search: async (query, limit): Promise<SearchResponse> => {
        asked.push([query, limit ?? 0]);
        return { query, results: three };
      },
    });
    const user = userEvent.setup();
    renderApp('/home', { api });
    await screen.findByRole('heading', { name: 'Hola, Ana' });
    await user.keyboard('{Meta>}k{/Meta}');
    const box = await screen.findByRole('combobox', { name: 'Buscar en la página' });
    await user.type(box, 'r');
    await new Promise((r) => setTimeout(r, 400));
    expect(asked).toEqual([]);
    expect(screen.getByText('Escribe al menos dos letras.')).toBeInTheDocument();
    await user.clear(box);
    await user.type(box, ' rib ');
    await screen.findAllByRole('option');
    expect(asked).toEqual([['rib', 8]]);
  });

  it('keeps the previous results while the next ones arrive, and does not say «nada» for a text it has not asked yet', async () => {
    let release: () => void = () => undefined;
    let waiting = false;
    const api = fakeApi({
      search: async (query): Promise<SearchResponse> => {
        if (query === 'zz') return { query, results: [] };
        if (query === 'rib') return { query, results: three };
        waiting = true;
        await new Promise<void>((resolve) => (release = resolve));
        return { query, results: three };
      },
    });
    const user = userEvent.setup();
    renderApp('/home', { api });
    await screen.findByRole('heading', { name: 'Hola, Ana' });
    await user.keyboard('{Meta>}k{/Meta}');
    const box = await screen.findByRole('combobox', { name: 'Buscar en la página' });
    await user.type(box, 'zz');
    await screen.findByText(/^Nada para «zz»/);
    await user.type(box, 'z');
    expect(screen.queryByText(/^Nada para/)).toBeNull();
    await user.clear(box);
    await user.type(box, 'rib');
    await screen.findAllByRole('option');
    await user.type(box, 'o');
    await waitFor(() => expect(waiting).toBe(true));
    expect(screen.getAllByRole('option')).toHaveLength(3);
    await act(async () => release());
  });

  it('forgets what was typed when it closes', async () => {
    const user = userEvent.setup();
    renderApp('/home', { api: answering(three) });
    await screen.findByRole('heading', { name: 'Hola, Ana' });
    await user.keyboard('{Meta>}k{/Meta}');
    await user.type(await screen.findByRole('combobox', { name: 'Buscar en la página' }), 'ri');
    await screen.findAllByRole('option');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull());
    await user.keyboard('{Meta>}k{/Meta}');
    const again = await screen.findByRole('combobox', { name: 'Buscar en la página' });
    expect(again).toHaveValue('');
    expect(screen.getByText('Escribe al menos dos letras.')).toBeInTheDocument();
  });

  it('the page of results asks for 50 and writes the text in the URL replacing the entry', async () => {
    const asked: number[] = [];
    const api = fakeApi({
      search: async (query, limit): Promise<SearchResponse> => {
        asked.push(limit ?? 0);
        return { query, results: three };
      },
    });
    const user = userEvent.setup();
    const { router } = renderApp('/search', { api });
    const box = await screen.findByRole('searchbox', { name: 'Buscar en todos los apuntes' });
    await user.type(box, 'rib');
    await screen.findByText(/secciones en/);
    expect(asked).toEqual([50]);
    expect(router.state.location.search).toBe('?q=rib');
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('erasing the text takes it out of the URL', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/search?q=ribo');
    const box = await screen.findByRole('searchbox', { name: 'Buscar en todos los apuntes' });
    await user.clear(box);
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(
      await screen.findByText(/^Busca por concepto, estructura o proceso\./),
    ).toBeInTheDocument();
  });
});

describe('the page of results counts the search', () => {
  it('on Enter', async () => {
    const sent: { kind: string; from?: string }[] = [];
    const api = fakeApi({
      usageOpen: async (body) => {
        sent.push(body);
        return { ok: true };
      },
    });
    const user = userEvent.setup();
    renderApp('/search?q=ribosomas', { api });
    const box = await screen.findByRole('searchbox', { name: 'Buscar en todos los apuntes' });
    await screen.findByText(/sección en/);
    await user.click(box);
    await user.keyboard('{Enter}');
    await waitFor(() => expect(sent).toEqual([{ kind: 'search', from: 'search' }]));
  });

  it('on a section’s link', async () => {
    const sent: { kind: string; from?: string }[] = [];
    const api = fakeApi({
      usageOpen: async (body) => {
        sent.push(body);
        return { ok: true };
      },
    });
    const user = userEvent.setup();
    renderApp('/search?q=mitocondrias', { api });
    await user.click(await screen.findByRole('link', { name: /^Ribosomas/ }));
    await waitFor(() => expect(sent).toEqual([{ kind: 'search', from: 'search' }]));
  });
});
