// Characterizes the pieces of the legal pages that are not plain text: the list of third-party packages, in its text
// nodes, while it loads and when it fails.
import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test/render';

afterEach(() => {
  vi.unstubAllGlobals();
});

const textNodes = (el: Node) => {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const out: string[] = [];
  while (walker.nextNode()) out.push(walker.currentNode.nodeValue ?? '');
  return out;
};

describe('the list of packages of /licenses', () => {
  it('each package keeps its name, its version, its license and who uses it in their own text nodes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json([
          {
            name: 'paquete-uno',
            version: '1.2.3',
            license: 'MIT',
            repository: null,
            usedBy: ['web'],
          },
          {
            name: 'paquete-dos',
            version: '4.5.6',
            license: 'ISC',
            repository: 'https://example.test/dos',
            usedBy: ['web', 'server'],
          },
        ]),
      ),
    );
    renderApp('/licenses', { session: null });
    const list = await screen.findByRole('list', { name: 'Paquetes de terceros' });
    const [one, two] = within(list).getAllByRole('listitem');
    expect(textNodes(one!)).toEqual(['paquete-uno', ' ', '1.2.3', 'MIT', ' ·', ' ', 'web']);
    expect(textNodes(two!)).toEqual([
      'paquete-dos',
      ' ',
      '4.5.6',
      'ISC',
      ' ·',
      ' ',
      'web y servidor',
    ]);
    expect(within(two!).getByRole('link', { name: 'paquete-dos' })).toHaveAttribute(
      'href',
      'https://example.test/dos',
    );
    expect(within(one!).queryByRole('link')).toBeNull();
  });

  it('says that it is loading and, if the file does not arrive, where the full text is', async () => {
    let answer: (r: Response) => void = () => undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((resolve) => (answer = resolve))),
    );
    renderApp('/licenses', { session: null });
    expect(await screen.findByText('Cargando la lista…')).toBeInTheDocument();
    answer(new Response(null, { status: 404 }));
    expect(
      await screen.findByText(
        'No se pudo cargar la lista. El texto completo está en third-party-licenses.txt.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Paquetes de terceros' })).toBeNull();
  });
});
