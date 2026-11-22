// The note's page around its article: its canonical address, retrying, what a report carries, the image viewer, arriving
// at a missing section, and «Ponte a prueba» and the neighbors when the assessment lacks a test, a deck or other notes.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Catalog, Note } from '@qv/schema';
import { localReportsRepository } from '../../reports/api/repository';
import { ApiRequestError } from '../../../shared/lib/api';
import { fakeApi } from '../../../test/fakes/api';
import { CATALOG } from '../../../test/fixtures/catalog';
import { NOTE } from '../../../test/fixtures/note';
import { renderApp } from '../../../test/render';

const PATH = '/semesters/2/courses/biologia-celular/notes/11-traduccion';

afterEach(() => vi.restoreAllMocks());

const withNote = (over: Partial<Note>, catalog: Catalog = CATALOG) =>
  fakeApi({ note: async () => ({ ...NOTE, ...over }), catalog: async () => catalog });

/** The catalog with Biología celular's Certamen 2 changed. */
function biocel(
  change: (a: Catalog['semesters'][number]['courses'][number]['assessments'][number]) => void,
) {
  const copy = structuredClone(CATALOG);
  change(copy.semesters[1]!.courses[0]!.assessments[0]!);
  return copy;
}

describe('the address of a note', () => {
  it.each([
    ['another semester', '/semesters/1/courses/biologia-celular/notes/11-traduccion'],
    ['another course', '/semesters/2/courses/fisica/notes/11-traduccion'],
  ])('a note opened under %s goes to its own address', async (_, wrong) => {
    const { router } = renderApp(wrong);
    await screen.findByRole('heading', { level: 1, name: 'Traducción' });
    await waitFor(() => expect(router.state.location.pathname).toBe(PATH));
  });

  it('after an error, «Reintentar» asks again and shows the note', async () => {
    const note = vi
      .fn<() => Promise<Note>>()
      .mockRejectedValueOnce(new ApiRequestError(500, 'internal', 'Falló de prueba.'))
      .mockResolvedValue(NOTE);
    renderApp(PATH, { api: fakeApi({ note }) });
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Traducción' }),
    ).toBeInTheDocument();
    expect(note).toHaveBeenCalledTimes(2);
  });
});

describe('the header', () => {
  it('the subtitle goes under the title only when the note has one', async () => {
    const { unmount } = renderApp(PATH);
    const title = await screen.findByRole('heading', { level: 1, name: 'Traducción' });
    expect(title.nextElementSibling).toHaveTextContent('Clase N.º 11');
    unmount();
    renderApp(PATH, { api: withNote({ subtitle: undefined }) });
    const bare = await screen.findByRole('heading', { level: 1, name: 'Traducción' });
    expect(bare.nextElementSibling).not.toHaveTextContent('Clase N.º 11');
  });
});

describe('a report of the whole note', () => {
  it('carries its code and version, or none for a note without them', async () => {
    const user = userEvent.setup();
    const reports = localReportsRepository({ admin: true });
    const send = vi.spyOn(reports, 'send');
    renderApp(PATH, { reports, api: withNote({ code: undefined, version: undefined }) });
    await user.click(
      await screen.findByRole('button', { name: 'Reportar un error en este apunte' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Reportar error' });
    await user.type(within(dialog).getByLabelText('¿Qué está mal?'), 'Falta algo');
    await user.click(within(dialog).getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    expect(send.mock.calls[0]![0]).toMatchObject({
      kind: 'note',
      id: NOTE.id,
      code: null,
      version: null,
      location: { path: PATH, title: 'Traducción' },
    });
  });
});

describe('the images', () => {
  it('a click outside an image opens nothing, and Escape closes an open one', async () => {
    const user = userEvent.setup();
    renderApp(PATH);
    await user.click(await screen.findByText('Dos subunidades.'));
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Ampliar la imagen: Ribosoma' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('an image before the first heading is reported without a section', async () => {
    const user = userEvent.setup();
    const reports = localReportsRepository({ admin: true });
    const send = vi.spyOn(reports, 'send');
    renderApp(PATH, {
      reports,
      api: withNote({
        html: '<figure class="figure"><img src="/api/media/b.webp" alt="Antes"><figcaption>Arriba</figcaption></figure><h2 id="a">A</h2>',
      }),
    });
    await user.click(await screen.findByRole('button', { name: 'Ampliar la imagen: Antes' }));
    await user.click(await screen.findByRole('button', { name: 'Reportar esta imagen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reportar error' });
    await user.type(within(dialog).getByLabelText('¿Qué está mal?'), 'Se ve mal');
    await user.click(within(dialog).getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    const { location } = send.mock.calls[0]![0];
    expect(location).toMatchObject({ figure: 'Arriba' });
    expect(location).not.toHaveProperty('section');
    expect(location).not.toHaveProperty('sectionTitle');
  });
});

describe('arriving at a section', () => {
  it.each(['#no-existe', '#:~:text=Dos'])(
    'a hash %s, that names no section of the article, scrolls nowhere',
    async (hash) => {
      const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
      renderApp(`${PATH}${hash}`);
      await screen.findByRole('heading', { level: 2, name: 'Ribosomas' });
      await screen.findByRole('navigation', { name: 'Ruta' });
      expect(spy).not.toHaveBeenCalled();
    },
  );
});

describe('the index bar of the phone', () => {
  it('a key other than Escape leaves its panel open', async () => {
    const user = userEvent.setup();
    renderApp(PATH);
    const button = await screen.findByRole('button', { name: /^Índice/ });
    await user.click(button);
    await user.keyboard('a');
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('an article without headings', () => {
  it('has no index bar nor index', async () => {
    renderApp(PATH, {
      api: withNote(
        { toc: [], html: '<p>Solo texto.</p>', practice: undefined },
        biocel((a) => (a.quizzes = [])),
      ),
    });
    await screen.findByText('Solo texto.');
    expect(screen.queryByRole('button', { name: /^Índice/ })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Índice del artículo' })).toBeNull();
  });
});

describe('«Ponte a prueba»', () => {
  it('a test the assessment does not have leaves only the deck', async () => {
    renderApp(PATH, {
      api: withNote({
        assessmentId: 'anatomia-1/certamen-1',
        practice: { quizId: 'otro-test', deck: 'Mazo de prueba' },
      }),
    });
    const heading = await screen.findByRole('heading', { level: 2, name: 'Ponte a prueba' });
    const section = heading.closest('section')!;
    expect(await within(section).findByRole('link', { name: /Mazo de Anki/ })).toBeInTheDocument();
    expect(within(section).queryByRole('link', { name: /Test/ })).toBeNull();
    expect(within(section).getAllByRole('link')).toHaveLength(1);
  });

  it('without a test named, the first of the assessment; without any test nor deck, no section nor entry', async () => {
    const { unmount } = renderApp(PATH, { api: withNote({ practice: undefined }) });
    const heading = await screen.findByRole('heading', { level: 2, name: 'Ponte a prueba' });
    expect(
      within(heading.closest('section')!).getByRole('link', { name: /Práctica de Biocel/ }),
    ).toBeInTheDocument();
    unmount();
    renderApp(PATH, {
      api: withNote(
        { practice: undefined },
        biocel((a) => (a.quizzes = [])),
      ),
    });
    await screen.findByRole('navigation', { name: 'Ruta' });
    expect(screen.queryByRole('heading', { level: 2, name: 'Ponte a prueba' })).toBeNull();
    const tocs = screen.getAllByRole('navigation', { name: 'Índice del artículo' });
    expect(within(tocs.at(-1)!).queryByRole('link', { name: 'Ponte a prueba' })).toBeNull();
  });
});

describe('the neighbors', () => {
  it('the only note of its assessment has neither «Anterior» nor «Siguiente»', async () => {
    renderApp(PATH, {
      api: withNote(
        {},
        biocel((a) => (a.notes = a.notes.slice(1))),
      ),
    });
    await screen.findByRole('navigation', { name: 'Ruta' });
    expect(screen.queryByRole('navigation', { name: 'Otros apuntes' })).toBeNull();
  });

  it('the last note has «Anterior» and an empty place for «Siguiente»', async () => {
    renderApp(PATH);
    const nav = await screen.findByRole('navigation', { name: 'Otros apuntes' });
    expect(within(nav).getByRole('link', { name: /Anterior/ })).toHaveAttribute(
      'href',
      '/semesters/2/courses/biologia-celular/notes/10-nucleo-celular',
    );
    expect(within(nav).queryByRole('link', { name: /Siguiente/ })).toBeNull();
  });
});
