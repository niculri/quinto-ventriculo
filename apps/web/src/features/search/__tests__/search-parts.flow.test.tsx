// Characterizes the quick search and the search page: what each says before, without and with results, on an error,
// and the text nodes of its lines.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { SearchResponse, SearchResult } from '@qv/schema';
import { ApiRequestError } from '../../../shared/lib/api';
import { fakeApi, renderApp } from '../../../test/render';

const textNodes = (el: Node) => {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const out: string[] = [];
  while (walker.nextNode()) out.push(walker.currentNode.nodeValue ?? '');
  return out;
};

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
