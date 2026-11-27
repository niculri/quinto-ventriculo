// Characterizes each part of a note's page: the header, the phone's index bar, the report line, the search tip,
// «Ponte a prueba», the neighbors, a gallery and the loading state, with their texts and text nodes.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { Note } from '@qv/schema';
import { ApiRequestError } from '../../../shared/lib/api';
import { fakeApi } from '../../../test/fakes/api';
import { CATALOG } from '../../../test/fixtures/catalog';
import { NOTE } from '../../../test/fixtures/note';
import { renderApp } from '../../../test/render';
import { textNodes } from '../../../test/dom';

const PATH = '/semesters/2/courses/biologia-celular/notes/11-traduccion';

afterEach(() => {
  vi.restoreAllMocks();
  document.getSelection()?.removeAllRanges();
});

const withNote = (over: Partial<Note>) => fakeApi({ note: async () => ({ ...NOTE, ...over }) });

describe('the header', () => {
  it('the line under the title with its separators and, folded under it, the code with its title, the dates and the sources', async () => {
    const { container } = renderApp(PATH, {
      api: withNote({ sources: ['Diapositivas de la clase', 'Un libro de prueba'] }),
    });
    await screen.findByRole('heading', { level: 1, name: 'Traducción' });
    const header = container.querySelector<HTMLElement>('article header')!;
    const line = header.querySelector<HTMLElement>('p.text-ink')!;
    expect(textNodes(line)).toEqual([
      'Clase 11',
      '·',
      'Prof. Luis Ejemplo A.',
      '·',
      'Semestre de primavera 2026',
      '·',
      'ICBM, Universidad de Chile',
    ]);
    expect(within(header).getByText('QV-BC-C2-11.2')).toHaveAttribute(
      'title',
      'Código y versión de este artículo',
    );
    const summary = within(header).getByText('Código, fechas y fuentes');
    expect(summary.tagName).toBe('SUMMARY');
    const details = summary.parentElement!;
    expect(details).not.toHaveAttribute('open');
    expect(details).toContainElement(within(header).getByText('QV-BC-C2-11.2'));
    expect(details).toContainElement(within(header).getByText(/^Creado el /));
    expect(
      within(details)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Diapositivas de la clase', 'Un libro de prueba']);
  });

  it('a note without a header says its kind above the title, and its id has no title', async () => {
    const { container } = renderApp(PATH, {
      api: withNote({ header: undefined, code: undefined, version: undefined, sources: [] }),
    });
    await screen.findByRole('heading', { level: 1, name: 'Traducción' });
    const header = container.querySelector<HTMLElement>('article header')!;
    expect(header.firstElementChild).toHaveTextContent(/^Clase$/);
    expect(within(header).getByText('AP-BC-C2-11')).not.toHaveAttribute('title');
    expect(within(header).getByText('Código y fechas').tagName).toBe('SUMMARY');
    expect(within(header).queryByRole('listitem')).toBeNull();
  });
});

describe('the index bar of the phone', () => {
  it('opens and closes its panel with the button, Escape, a touch outside and a choice', async () => {
    const user = userEvent.setup();
    renderApp(PATH);
    const button = await screen.findByRole('button', { name: /^Índice/ });
    expect(textNodes(button)[0]).toBe('Índice');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-controls', 'toc-panel');
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const panel = document.getElementById('toc-panel')!;
    expect(
      within(panel).getByRole('navigation', { name: 'Índice del artículo' }),
    ).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await user.click(button);
    fireEvent.pointerDown(document.body);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await user.click(button);
    await user.click(
      within(document.getElementById('toc-panel')!).getByRole('link', { name: 'Ribosomas' }),
    );
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('the index of the right column goes back to the top and shows how much is read', async () => {
    renderApp(PATH);
    const tocs = await screen.findAllByRole('navigation', { name: 'Índice del artículo' });
    const toc = tocs.at(-1)!;
    expect(within(toc).getByRole('button', { name: 'Volver al inicio' })).toBeInTheDocument();
    expect(within(toc).getByText('En este artículo')).toBeInTheDocument();
    expect(within(toc).getByRole('progressbar', { name: 'Cuánto llevas leído' })).toHaveAttribute(
      'aria-valuemax',
      '100',
    );
  });
});

describe('the end of the article', () => {
  it('the report line and the search tip, with their text nodes', async () => {
    renderApp(PATH);
    const report = await screen.findByRole('button', { name: 'Reportar un error en este apunte' });
    expect(textNodes(report)).toEqual([' Reportar un error en este apunte']);
    expect(screen.getByText('O selecciona el texto que está mal.')).toBeInTheDocument();
    const tip = await screen.findByText(/¿Buscas otro tema\?/);
    expect(textNodes(tip)).toEqual([
      '¿Buscas otro tema? El buscador de arriba encuentra cualquier apunte',
      ', también con Ctrl+K',
      '.',
    ]);
    expect(screen.getByRole('button', { name: 'Cerrar el consejo' })).toBeInTheDocument();
  });

  it('the neighbors, «Anterior» and «Siguiente», with their text nodes', async () => {
    renderApp('/semesters/2/courses/biologia-celular/notes/10-nucleo-celular', {
      api: withNote({ id: 'AP-BC-C2-10', slug: '10-nucleo-celular', title: 'Núcleo celular' }),
    });
    const nav = await screen.findByRole('navigation', { name: 'Otros apuntes' });
    const next = within(nav).getByRole('link', { name: /Siguiente/ });
    expect(next).toHaveAttribute(
      'href',
      '/semesters/2/courses/biologia-celular/notes/11-traduccion',
    );
    expect(textNodes(next)).toEqual(['Siguiente ', 'Traducción']);
    expect(within(nav).queryByRole('link', { name: /Anterior/ })).toBeNull();
  });

  it('an image without caption nor alt is reported as «Imagen sin leyenda», and its button says so', async () => {
    const user = userEvent.setup();
    renderApp(PATH, {
      api: withNote({
        html: '<h2 id="a">A</h2><figure class="figure"><img src="/api/media/b.webp"></figure>',
      }),
    });
    await user.click(await screen.findByRole('button', { name: 'Ampliar la imagen' }));
    await user.click(await screen.findByRole('button', { name: 'Reportar esta imagen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reportar error' });
    expect(within(dialog).getByText('Imagen: Imagen sin leyenda')).toBeInTheDocument();
  });
});

describe('«Ponte a prueba»', () => {
  it('the test with its topics and the deck, with their text nodes', async () => {
    renderApp(PATH, {
      api: withNote({
        assessmentId: 'anatomia-1/certamen-1',
        practice: {
          quizId: 'practica-biocel',
          section: 'pautas',
          groups: ['01', '02'],
          deck: 'Mazo de prueba',
        },
      }),
    });
    const heading = await screen.findByRole('heading', { level: 2, name: 'Ponte a prueba' });
    const section = heading.closest('section')!;
    expect(
      within(section).getByText(
        'Comprueba lo que aprendiste con preguntas y tarjetas de esta materia.',
      ),
    ).toBeInTheDocument();
    const deck = await within(section).findByRole('link', { name: /Mazo de Anki/ });
    expect(textNodes(deck)).toEqual([
      ' Mazo de Anki',
      'Mazo de prueba',
      '4 tarjetas',
      'Ver el mazo',
      ' ',
    ]);
    const test = within(section).getByRole('link', { name: /Test/ });
    expect(textNodes(test).slice(0, 2)).toEqual([' Test', 'Práctica de Biocel']);
    expect(await within(test).findByText(/^Temas:/)).toBeInTheDocument();
    expect(textNodes(test).slice(-2)).toEqual(['Abrir el test', ' ']);
  });

  it('a test without topics says its questions', async () => {
    renderApp(PATH, { api: withNote({ practice: { quizId: 'practica-biocel' } }) });
    const heading = await screen.findByRole('heading', { level: 2, name: 'Ponte a prueba' });
    const test = within(heading.closest('section')!).getByRole('link', { name: /Test/ });
    expect(within(test).getByText('4 preguntas')).toBeInTheDocument();
  });
});

/** For each text node under `el`, whether it is inside an element hidden with `invisible`. */
const unseen = (el: Element) => {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const out: boolean[] = [];
  while (walker.nextNode()) out.push(!!walker.currentNode.parentElement?.closest('.invisible'));
  return out;
};

describe('while the note loads', () => {
  it('a status with what it is, and the breadcrumbs once the catalog is in', async () => {
    renderApp(PATH, { api: fakeApi({ note: () => new Promise(() => {}) }) });
    expect(await screen.findByRole('status', { name: 'Cargando el apunte' })).toBeInTheDocument();
    const crumbs = await screen.findByRole('navigation', { name: 'Ruta' });
    expect(within(crumbs).getByRole('link', { name: 'Apuntes' })).toHaveAttribute(
      'href',
      '/semesters/2/courses/biologia-celular/assessments/certamen-2/notes',
    );
  });

  it('the header the catalog knows, as unseen lines that take its room, with no heading, and the index bar’s room', async () => {
    renderApp(PATH, { api: fakeApi({ note: () => new Promise(() => {}) }) });
    await screen.findByRole('navigation', { name: 'Ruta' });
    const status = screen.getByRole('status', { name: 'Cargando el apunte' });
    const ghost = status.firstElementChild!;
    expect(ghost).toHaveAttribute('aria-hidden', 'true');
    expect(textNodes(ghost)).toEqual(['Clase', 'Traducción', 'Clase N.º 11']);
    expect(ghost.querySelector('h1')).toBeNull();
    expect(unseen(ghost)).toEqual([true, true, true]);
    expect(ghost.nextElementSibling).toHaveClass('xl:hidden');
  });

  it('the line under the title, unseen too, with its separators', async () => {
    const catalog = structuredClone(CATALOG);
    catalog.semesters[1]!.courses[0]!.assessments[0]!.notes[1]!.header = NOTE.header!;
    renderApp(PATH, {
      api: fakeApi({ note: () => new Promise(() => {}), catalog: async () => catalog }),
    });
    await screen.findByRole('navigation', { name: 'Ruta' });
    const status = screen.getByRole('status', { name: 'Cargando el apunte' });
    const lines = status.firstElementChild!.querySelectorAll('p');
    expect([...lines].map((p) => textNodes(p))).toEqual([
      ['Traducción'],
      ['Clase N.º 11'],
      [
        'Clase 11',
        '·',
        'Prof. Luis Ejemplo A.',
        '·',
        'Semestre de primavera 2026',
        '·',
        'ICBM, Universidad de Chile',
      ],
    ]);
    expect(unseen(lines[2]!)).toEqual(Array.from({ length: 7 }, () => true));
  });
});

describe('arriving at a section', () => {
  const sections =
    '<h2 id="ribosomas">Ribosomas</h2><p>Uno.</p><h2 id="núcleo celular">Núcleo</h2><p>Dos.</p>';
  const scrolledTo = (spy: { mock: { contexts: unknown[] } }) =>
    spy.mock.contexts.map((el) => (el as HTMLElement).id);

  it('the hash goes to its section, without the text fragment the browser left in it', async () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
    renderApp(`${PATH}#ribosomas:~:text=Uno`, { api: withNote({ html: sections }) });
    await screen.findByRole('heading', { level: 2, name: 'Ribosomas' });
    await waitFor(() => expect(scrolledTo(spy)).toEqual(['ribosomas']));
  });

  it('the hash goes to its section decoded', async () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
    renderApp(`${PATH}#n%C3%BAcleo%20celular`, { api: withNote({ html: sections }) });
    await screen.findByRole('heading', { level: 2, name: 'Núcleo' });
    await waitFor(() => expect(scrolledTo(spy)).toEqual(['núcleo celular']));
  });

  it('the article waits for the catalog in the frame of a page that loads, and then goes to the section once', async () => {
    let arrive: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (arrive = resolve));
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
    renderApp(`${PATH}#ribosomas`, {
      api: fakeApi({
        note: async () => ({ ...NOTE, html: sections }),
        catalog: async () => {
          await gate;
          return CATALOG;
        },
      }),
    });
    const main = await screen.findByRole('main');
    expect(await within(main).findByRole('status')).toHaveTextContent('Cargando…');
    expect(within(main).queryByRole('navigation', { name: 'Ruta' })).toBeNull();
    expect(screen.queryByRole('heading', { level: 2, name: 'Ribosomas' })).toBeNull();
    await act(async () => arrive());
    await screen.findByRole('heading', { level: 2, name: 'Ribosomas' });
    await waitFor(() => expect(scrolledTo(spy)).toEqual(['ribosomas']));
  });

  it('the article does not wait for the catalog once its first request failed, while it retries', async () => {
    renderApp(PATH, {
      api: fakeApi({
        catalog: () => Promise.reject(new ApiRequestError(503, 'unavailable', 'Unavailable')),
      }),
      queryClient: new QueryClient({
        defaultOptions: { queries: { retry: 1, retryDelay: 60_000 } },
      }),
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Traducción' })).toBeVisible();
    expect(
      within(screen.getByRole('main')).getByRole('navigation', { name: 'Ruta' }),
    ).not.toHaveTextContent('Biología celular');
  });
});

describe('what the page does besides showing the note', () => {
  it('opening a note keeps it for «Seguir», and the reading page of development does not', async () => {
    renderApp(PATH);
    await screen.findByRole('heading', { level: 1, name: 'Traducción' });
    expect(window.localStorage.getItem('qv-last-note')).toBe('11-traduccion');
    window.localStorage.clear();
    renderApp('/dev/reading');
    await screen.findByRole('heading', { level: 1, name: 'La bomba de sodio y potasio' });
    expect(window.localStorage.getItem('qv-last-note')).toBeNull();
  });

  it('a note that does not exist says so, and another error offers to try again', async () => {
    renderApp(PATH, {
      api: fakeApi({
        note: async () => {
          throw new ApiRequestError(404, 'not_found', 'Ese apunte no existe.');
        },
      }),
    });
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Esta página no aparece ni en el Netter',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull();
  });

  it('an error of the server shows its message with «Reintentar»', async () => {
    renderApp(PATH, {
      api: fakeApi({
        note: async () => {
          throw new ApiRequestError(500, 'internal', 'Falló de prueba.');
        },
      }),
    });
    expect(await screen.findByText('Falló de prueba.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 1, name: 'Esta página no aparece ni en el Netter' }),
    ).toBeNull();
  });

  it('too many requests in a row says to wait, and «Reintentar» opens the note once it went through', async () => {
    let refused = true;
    renderApp(PATH, {
      api: fakeApi({
        note: async () => {
          if (refused) {
            throw new ApiRequestError(
              429,
              'rate_limited',
              'Llegaron demasiados pedidos seguidos. Espera unos segundos y vuelve a intentarlo.',
              10,
            );
          }
          return NOTE;
        },
      }),
    });
    expect(
      await screen.findByText(
        'Llegaron demasiados pedidos seguidos. Espera unos segundos y vuelve a intentarlo.',
      ),
    ).toBeInTheDocument();
    refused = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { level: 1, name: NOTE.title })).toBeInTheDocument();
  });
});

describe('the images of the article', () => {
  it('each one is a button for the keyboard: Enter and Space open it, and a long caption is cut when reported', async () => {
    const long = 'a'.repeat(400);
    const user = userEvent.setup();
    renderApp(PATH, {
      api: withNote({
        html: `<h2 id="a">A</h2><figure class="figure"><img src="/api/media/b.webp" alt="${long}"></figure>`,
      }),
    });
    const image = await screen.findByRole('button', { name: `Ampliar la imagen: ${long}` });
    expect(image).toHaveAttribute('tabindex', '0');
    expect(fireEvent.keyDown(image, { key: ' ' })).toBe(false);
    await user.click(await screen.findByRole('button', { name: 'Reportar esta imagen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reportar error' });
    expect(within(dialog).getByText(`Imagen: ${'a'.repeat(300)}`)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(fireEvent.keyDown(image, { key: 'Enter' })).toBe(false);
    expect(await screen.findByRole('button', { name: 'Reportar esta imagen' })).toBeInTheDocument();
    expect(fireEvent.keyDown(image, { key: 'a' })).toBe(true);
  });
});

describe('reporting what is selected', () => {
  const select = (text: string) =>
    act(() => {
      const range = document.createRange();
      range.selectNodeContents(screen.getByText(text));
      const selection = document.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });

  it('the bar takes neither the pointer nor the mouse, so that tapping it does not clear the selection', async () => {
    renderApp(PATH);
    await screen.findByText('Texto.');
    select('Texto.');
    const bar = await screen.findByRole('button', { name: 'Reportar lo seleccionado' });
    expect(fireEvent.pointerDown(bar)).toBe(false);
    expect(fireEvent.mouseDown(bar)).toBe(false);
  });

  it('once the selection is cleared the bar waits a moment before it goes', async () => {
    renderApp(PATH);
    await screen.findByText('Texto.');
    select('Texto.');
    await screen.findByRole('button', { name: 'Reportar lo seleccionado' });
    act(() => {
      document.getSelection()!.removeAllRanges();
      document.dispatchEvent(new Event('selectionchange'));
    });
    await act(async () => new Promise((r) => setTimeout(r, 150)));
    expect(screen.getByRole('button', { name: 'Reportar lo seleccionado' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Reportar lo seleccionado' })).toBeNull(),
    );
  });

  it('once sent, the selection goes, the thanks show for three seconds and then go', async () => {
    const user = userEvent.setup();
    renderApp(PATH);
    await screen.findByText('Texto.');
    select('Texto.');
    await user.click(await screen.findByRole('button', { name: 'Reportar lo seleccionado' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reportar error' });
    await user.type(within(dialog).getByLabelText('¿Qué está mal?'), 'No es así');
    await user.click(within(dialog).getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('Gracias: tu reporte le llegó al autor.')).toBeInTheDocument();
    expect(document.getSelection()!.rangeCount).toBe(0);
    await waitFor(
      () => expect(screen.queryByText('Gracias: tu reporte le llegó al autor.')).toBeNull(),
      { timeout: 6000 },
    );
  });
});

describe('a gallery', () => {
  const figure = (alt: string) =>
    `<figure class="figure"><img data-media="k" alt="${alt}" width="800" height="600"><figcaption>${alt}</figcaption></figure>`;

  it('its arrows step through the figures without opening the viewer; a figure still opens it', async () => {
    renderApp(PATH, {
      api: withNote({
        html: `<h2 id="a">A</h2>${figure('Primera')}${figure('Segunda')}<p>Texto.</p>`,
      }),
    });
    const next = await screen.findByRole('button', { name: 'Imagen siguiente' });
    expect(screen.getByText('1 de 2')).toBeInTheDocument();
    await userEvent.click(next);
    expect(screen.getByText('2 de 2')).toBeInTheDocument();
    expect(next).toBeDisabled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ampliar la imagen: Segunda' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
