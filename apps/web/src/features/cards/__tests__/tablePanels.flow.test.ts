// Tests the panels around the cards page's table in «Modo avanzado»: the sidebar's groups, the columns menu, the
// sort, the preview's buttons and the panel for narrow screens.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../../test/render';

const TABLE = '/semesters/1/courses/anatomia-1/anki/certamen-1/cards?view=table';

const grid = () => screen.findByRole('grid', { name: /Tarjetas|Notas/ });
const rows = async () =>
  within(await grid())
    .getAllByRole('row')
    .slice(1);
const sidebar = () => screen.findByRole('navigation', { name: 'Barra lateral del explorador' });
const query = (router: { state: { location: { search: string } } }) =>
  new URLSearchParams(router.state.location.search).get('q');

describe('the table’s sidebar', () => {
  it('has today’s, the decks, the note types, the tags, the states and the flags', async () => {
    renderApp(TABLE);
    const side = await sidebar();
    const groups = [...side.querySelectorAll('summary')].map((s) => s.textContent);
    expect(groups).toEqual([
      'Hoy',
      'Mazos',
      'Tipos de nota',
      'Etiquetas',
      'Estado de la tarjeta',
      'Banderas',
    ]);
    const buttons = within(side)
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(buttons).toEqual([
      'Estudiadas hoy',
      'Olvidadas hoy',
      'Para hoy',
      'Plegar Certamen 1',
      'Certamen 1',
      'Plegar S1 - Semana de prueba',
      'S1 - Semana de prueba',
      'Plegar Mazo de prueba',
      'Mazo de prueba',
      'Extras',
      'Prueba · Básica',
      'Directa',
      'Prueba · Cloze',
      'Prueba · Oclusión',
      'Sin etiquetas',
      'columna',
      'cervical',
      'prueba',
      'Nuevas',
      'Aprendiendo',
      'A repasar',
      'Suspendidas',
      'Enterradas',
      'Rojo',
      'Naranja',
      'Verde',
      'Azul',
      'Rosado',
      'Turquesa',
      'Morado',
      'Sin bandera',
    ]);
  });

  it('folds a deck, and a tag, a flag or a note type with Mayús or Alt change the search', async () => {
    const user = userEvent.setup();
    const { router } = renderApp(TABLE);
    const side = await sidebar();
    await user.click(within(side).getByRole('button', { name: 'Plegar S1 - Semana de prueba' }));
    expect(within(side).queryByRole('button', { name: 'Mazo de prueba' })).toBeNull();
    expect(
      within(side).getByRole('button', { name: 'Desplegar S1 - Semana de prueba' }),
    ).toHaveAttribute('aria-expanded', 'false');
    await user.click(within(side).getByRole('button', { name: 'Desplegar S1 - Semana de prueba' }));
    expect(within(side).getByRole('button', { name: 'Mazo de prueba' })).toBeInTheDocument();

    await user.click(within(side).getByRole('button', { name: 'cervical' }));
    expect(query(router)).toBe('tag:columna::cervical');
    await user.keyboard('{Shift>}');
    await user.click(within(side).getByRole('button', { name: 'Rojo' }));
    await user.keyboard('{/Shift}');
    expect(query(router)).toBe('(tag:columna::cervical) OR flag:1');
    await user.keyboard('{Alt>}');
    await user.click(within(side).getByRole('button', { name: 'Sin bandera' }));
    await user.keyboard('{/Alt}');
    expect(query(router)).toBe('-flag:0');
    await user.click(within(side).getByRole('button', { name: 'Prueba · Cloze' }));
    expect(query(router)).toBe('"note:Prueba · Cloze"');
    expect(await rows()).toHaveLength(2);
  });

  it('on a narrow screen opens as a panel, which a search closes', async () => {
    renderApp(TABLE);
    await grid();
    await userEvent.click(screen.getByRole('button', { name: 'Barra lateral' }));
    const panel = await screen.findByRole('dialog', { name: 'Barra lateral' });
    expect(panel).toHaveAccessibleDescription(
      'Mazos, tipos de nota, etiquetas, estados y banderas para buscar.',
    );
    await userEvent.click(within(panel).getByRole('button', { name: 'Enterradas' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Barra lateral' })).toBeNull());
  });
});

describe('the table’s columns and preview', () => {
  it('keeps at least one column, remembers them and marks the sort', async () => {
    renderApp(TABLE);
    const g = await grid();
    expect(within(g).getByRole('columnheader', { name: 'Campo de orden' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    expect(within(g).getByRole('columnheader', { name: 'Código' })).toHaveAttribute(
      'aria-sort',
      'none',
    );
    await userEvent.click(within(g).getByRole('button', { name: 'Campo de orden' }));
    expect(within(g).getByRole('columnheader', { name: 'Campo de orden' })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
    await userEvent.click(screen.getByRole('button', { name: /Columnas/ }));
    const menu = await screen.findByRole('menu');
    for (const name of ['Código', 'Tarjeta', 'Vencimiento', 'Mazo']) {
      await userEvent.click(within(menu).getByRole('menuitemcheckbox', { name }));
    }
    expect(within(menu).getByRole('menuitemcheckbox', { name: 'Campo de orden' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await userEvent.click(within(menu).getByRole('menuitemcheckbox', { name: 'Olvidos' }));
    await userEvent.keyboard('{Escape}');
    expect(
      within(await grid())
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Campo de orden', 'Olvidos']);
    expect(JSON.parse(localStorage.getItem('qv-browse')!)).toEqual({
      mode: 'cards',
      columns: ['sortField', 'lapses'],
      sort: { column: 'sortField', descending: true },
    });
  });

  it('starts from the saved columns, and ignores a saved column it does not know', async () => {
    localStorage.setItem(
      'qv-browse',
      JSON.stringify({
        mode: 'notes',
        columns: ['code', 'tags'],
        sort: { column: 'code', descending: false },
      }),
    );
    const first = renderApp(TABLE);
    expect(
      within(await screen.findByRole('grid', { name: 'Notas' }))
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Código', 'Etiquetas']);
    first.unmount();
    localStorage.setItem('qv-browse', JSON.stringify({ mode: 'notes', columns: ['nope'] }));
    renderApp(TABLE);
    expect(
      within(await screen.findByRole('grid', { name: 'Tarjetas' }))
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Campo de orden', 'Código', 'Tarjeta', 'Vencimiento', 'Mazo']);
  });

  it('the preview: «Ir al mazo», «Ver en grande» and «Reportar error»', async () => {
    const { router } = renderApp(TABLE);
    await grid();
    const preview = screen.getByRole('complementary', { name: 'Vista previa' });
    expect(preview).toHaveTextContent('Elige una tarjeta para verla.');
    await userEvent.click((await rows())[0]!);
    expect(screen.getByRole('link', { name: 'Ir al mazo' })).toHaveAttribute(
      'href',
      '/semesters/1/courses/anatomia-1/anki/certamen-1/s1-semana-de-prueba/mazo-de-prueba',
    );
    await userEvent.click(within(preview).getByRole('button', { name: 'Ver en grande' }));
    expect(new URLSearchParams(router.state.location.search).get('open')).toBe('1');
    const viewer = await screen.findByRole('dialog', { name: /T-PR-01-001\.2/ });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(viewer).not.toBeInTheDocument());
    expect(new URLSearchParams(router.state.location.search).get('open')).toBeNull();

    await userEvent.click(within(preview).getByRole('button', { name: 'Reportar error' }));
    const dialog = await screen.findByRole('dialog', { name: /Reportar/ });
    await userEvent.type(within(dialog).getByRole('textbox'), 'Falta una vértebra');
    await userEvent.click(within(dialog).getByRole('button', { name: /Enviar/ }));
    expect(
      await within(preview).findByText('Gracias: tu reporte le llegó al autor.'),
    ).toBeInTheDocument();
  });

  it('the big viewer goes through the table’s rows in order, and the URL follows the card it shows', async () => {
    const { router } = renderApp(TABLE);
    const second = (await rows())[1]!;
    const code = within(second).getAllByRole('gridcell')[1]!.textContent;
    await userEvent.click((await rows())[0]!);
    await userEvent.click(
      within(screen.getByRole('complementary', { name: 'Vista previa' })).getByRole('button', {
        name: 'Ver en grande',
      }),
    );
    const viewer = await screen.findByRole('dialog', { name: /T-PR-01-001\.2/ });
    await userEvent.click(within(viewer).getByRole('button', { name: 'Tarjeta siguiente' }));
    const url = () => new URLSearchParams(router.state.location.search);
    await waitFor(() => expect(url().get('note')).toBe('cloze-1'));
    expect([url().get('ord'), url().get('open')]).toEqual(['0', '1']);
    expect(await screen.findByRole('dialog', { name: new RegExp(code!.replace('.', '\\.')) })).toBeInTheDocument();
  });

  it('in «Notas» the preview shows the first card of the chosen note', async () => {
    renderApp(TABLE);
    await grid();
    await userEvent.click(screen.getByRole('button', { name: 'Notas' }));
    const cloze = (await rows()).find((r) => r.textContent.includes('La columna tiene'))!;
    await userEvent.click(cloze);
    const info = screen.getByRole('region', { name: 'Información de la tarjeta' });
    const terms = within(info).getAllByRole('term').map((t) => t.textContent);
    expect(within(info).getAllByRole('definition')[terms.indexOf('Tarjeta')]).toHaveTextContent('Cloze 1');
  });
});
