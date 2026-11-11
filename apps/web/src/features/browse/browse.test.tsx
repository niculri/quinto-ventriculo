import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { searchTerm } from '@qv/anki-search';
import { DECK, renderApp, fullAnkiStudy } from '../../test/render';
import type { StudyRepository } from '../study/repository';
import { combineSearch } from './Sidebar';

afterEach(() => localStorage.clear());

/** The «Tabla» of the cards page (Modo avanzado: the tests' study is in it). */
const TABLE = '/semesters/1/courses/anatomia-1/anki/certamen-1/cards?view=table';

const grid = () => screen.findByRole('grid', { name: /Tarjetas|Notas/ });

/** The rows of the table (without its header), by their first cell. */
async function rowNames() {
  const g = await grid();
  return within(g)
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('gridcell')[0]!.textContent);
}

async function searchFor(text: string) {
  const box = await screen.findByRole('searchbox', { name: /Buscar/ });
  await userEvent.clear(box);
  if (text) await userEvent.type(box, text);
  await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
}

/** A card answered yesterday, as a review (so it has something to forget and a history). */
async function reviewed(study: StudyRepository) {
  const now = new Date();
  await study.recordReview({
    card: { noteGuid: 's@/AqX%n?#', ord: 0, deckId: '20' },
    expectedUpdatedAt: null,
    rating: 3,
    queueBefore: 'new',
    interval: 4,
    lastInterval: 0,
    durationMs: 6000,
    state: {
      phase: 'review',
      interday: true,
      remainingSteps: 0,
      due: new Date(now.getTime() + 4 * 86_400_000).toISOString(),
      interval: 4,
      stability: 4.5,
      difficulty: 5.5,
      reps: 3,
      lapses: 1,
      lastReview: now.toISOString(),
      suspended: false,
      leech: false,
    },
    bury: [],
    buriedUntil: null,
  });
}

describe('the table of the cards page (Anki’s browser)', () => {
  it('lists every card with the chosen columns, and searches with Anki’s syntax', async () => {
    renderApp(TABLE);
    expect(await rowNames()).toEqual([
      '¿Cuántas vértebras cervicales hay?',
      'La columna tiene 7 vértebras cervicales',
      'La columna tiene 7 vértebras cervicales',
      'Vértebra de prueba',
    ]);
    expect(screen.getByText('4 tarjetas')).toBeInTheDocument();
    const header = within(await grid())
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(header).toEqual(['Campo de orden', 'Código', 'Tarjeta', 'Vencimiento', 'Mazo']);
    const cloze2 = within(await grid()).getAllByRole('row')[3]!;
    expect(
      within(cloze2)
        .getAllByRole('gridcell')
        .map((c) => c.textContent),
    ).toEqual([
      'La columna tiene 7 vértebras cervicales',
      'T-PR-01-002.1',
      'Cloze 2',
      'Nueva #2',
      'Extras',
    ]);

    await searchFor(`${searchTerm('deck', `${DECK.fullName}::Extras`)}`);
    expect(await rowNames()).toEqual(['La columna tiene 7 vértebras cervicales']);
    // A deck finds its subdecks too, as in Anki.
    await searchFor(searchTerm('deck', DECK.fullName));
    expect(await rowNames()).toHaveLength(4);
    await searchFor('tag:columna card:1');
    expect(await rowNames()).toEqual([
      '¿Cuántas vértebras cervicales hay?',
      'La columna tiene 7 vértebras cervicales',
    ]);
    await searchFor('vértebra -cervicales');
    expect(await rowNames()).toEqual(['Vértebra de prueba']);
    // Without accents (Anki's «Ignore accents in search», on in the web): «vertebra» finds «Vértebra».
    await searchFor('VERTEBRA -cervicales');
    expect(await rowNames()).toEqual(['Vértebra de prueba']);
    await searchFor('note:*oclusión* or Frente:¿cuántas*');
    expect(await rowNames()).toEqual(['¿Cuántas vértebras cervicales hay?', 'Vértebra de prueba']);
  });

  it('a search it does not understand says why', async () => {
    renderApp(`${TABLE}&q=${encodeURIComponent('(is:new')}`);
    expect(await screen.findByText('No se entiende la búsqueda')).toBeInTheDocument();
    expect(screen.getByRole('alert').textContent).toMatch(/paréntesis/);
  });

  it('the sidebar builds the search: a click replaces it, with Ctrl it adds, with Alt it negates', async () => {
    const { router } = renderApp(TABLE);
    const side = await screen.findByRole('navigation', { name: 'Barra lateral del explorador' });
    await userEvent.click(within(side).getByRole('button', { name: 'Extras' }));
    expect(new URLSearchParams(router.state.location.search).get('q')).toBe(
      searchTerm('deck', `${DECK.fullName}::Extras`),
    );
    expect(await rowNames()).toHaveLength(1);
    await userEvent.click(within(side).getByRole('button', { name: 'Nuevas' }));
    expect(new URLSearchParams(router.state.location.search).get('q')).toBe('is:new');
    expect(combineSearch('is:new', 'tag:x', 'and', false)).toBe('(is:new) tag:x');
    expect(combineSearch('is:new', 'tag:x', 'or', true)).toBe('(is:new) OR -tag:x');
    expect(combineSearch('', 'tag:x', 'and', false)).toBe('tag:x');
  });

  it('notes mode: one row per note', async () => {
    renderApp(TABLE);
    await grid();
    await userEvent.click(screen.getByRole('button', { name: 'Notas' }));
    expect(await rowNames()).toEqual([
      '¿Cuántas vértebras cervicales hay?',
      'La columna tiene 7 vértebras cervicales',
      'Vértebra de prueba',
    ]);
    expect(screen.getByText('3 notas')).toBeInTheDocument();
  });

  it('sorts by a column and chooses the columns', async () => {
    renderApp(TABLE);
    const g = await grid();
    await userEvent.click(within(g).getByRole('button', { name: 'Código' }));
    await userEvent.click(within(g).getByRole('button', { name: 'Código' }));
    await waitFor(async () => expect((await rowNames())[0]).toBe('Vértebra de prueba'));
    await userEvent.click(screen.getByRole('button', { name: /Columnas/ }));
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: /Repasos/ }));
    await userEvent.keyboard('{Escape}');
    expect(within(await grid()).getByRole('columnheader', { name: /Repasos/ })).toBeInTheDocument();
  });

  it('selects with a click, Ctrl/⌘ and Mayús, and the preview shows the current card', async () => {
    const user = userEvent.setup();
    const { router } = renderApp(TABLE);
    const g = await grid();
    const rows = () => within(g).getAllByRole('row').slice(1);
    await user.click(rows()[0]!);
    expect(rows()[0]).toHaveAttribute('aria-selected', 'true');
    expect(new URLSearchParams(router.state.location.search).get('note')).toBe('s@/AqX%n?#');
    await user.keyboard('{Control>}');
    await user.click(rows()[2]!);
    await user.keyboard('{/Control}');
    expect(rows().map((r) => r.getAttribute('aria-selected'))).toEqual([
      'true',
      'false',
      'true',
      'false',
    ]);
    await user.keyboard('{Shift>}');
    await user.click(rows()[3]!);
    await user.keyboard('{/Shift}');
    expect(screen.getByText('4 tarjetas · 2 seleccionadas')).toBeInTheDocument();
    // The preview: the current card, front and back.
    const preview = screen.getByRole('complementary', { name: 'Vista previa' });
    expect(
      await within(preview).findByRole('region', { name: 'Frente de la tarjeta' }),
    ).toBeInTheDocument();
    await userEvent.click(within(preview).getByRole('button', { name: 'Reverso' }));
    expect(
      await within(preview).findByRole('region', { name: 'Reverso de la tarjeta' }),
    ).toBeInTheDocument();
  });

  it('suspends and flags the selection, Ctrl+Z undoes it, and the search sees it', async () => {
    const study = fullAnkiStudy();
    renderApp(TABLE, { study });
    const g = await grid();
    await userEvent.click(within(g).getAllByRole('row')[1]!);
    await userEvent.click(screen.getByRole('button', { name: 'Suspender' }));
    await waitFor(async () =>
      expect((await study.allCards()).map((c) => [c.noteGuid, c.suspended])).toEqual([
        ['s@/AqX%n?#', true],
      ]),
    );
    expect(await screen.findByRole('button', { name: 'Quitar suspensión' })).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(within(g).getAllByRole('row')[1]!).getAllByRole('gridcell')[3]!.textContent,
      ).toBe('(Nueva #1)'),
    );
    await act(async () => {
      fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    });
    expect(await screen.findByText('Deshecho: Suspender tarjeta')).toBeInTheDocument();
    await waitFor(async () => expect(await study.allCards()).toEqual([]));

    // Ctrl+3: the green flag; again, it takes it off (as Anki).
    await act(async () => {
      fireEvent.keyDown(window, { key: '3', ctrlKey: true });
    });
    await waitFor(async () => expect((await study.allCards())[0]?.flag).toBe(3));
    await searchFor('flag:3');
    expect(await rowNames()).toEqual(['¿Cuántas vértebras cervicales hay?']);
    await userEvent.click(within(await grid()).getAllByRole('row')[1]!);
    await act(async () => {
      fireEvent.keyDown(window, { key: '3', ctrlKey: true });
    });
    await waitFor(async () => expect((await study.allCards())[0]?.flag).toBe(0));
  });

  it('buries and unburies (only until tomorrow)', async () => {
    const study = fullAnkiStudy();
    renderApp(TABLE, { study });
    const g = await grid();
    await userEvent.click(within(g).getAllByRole('row')[4]!);
    await userEvent.click(screen.getByRole('button', { name: 'Enterrar' }));
    await waitFor(async () =>
      expect(Date.parse((await study.allCards())[0]!.buriedUntil!)).toBeGreaterThan(Date.now()),
    );
    await searchFor('is:buried');
    expect(await rowNames()).toEqual(['Vértebra de prueba']);
    await userEvent.click(within(await grid()).getAllByRole('row')[1]!);
    await userEvent.click(await screen.findByRole('button', { name: 'Desenterrar' }));
    await waitFor(async () => expect((await study.allCards())[0]!.buriedUntil).toBeNull());
  });

  it('«Olvidar» sends a card back to new (resetting its counts if asked), and undo brings it back', async () => {
    const study = fullAnkiStudy();
    await reviewed(study);
    renderApp(`${TABLE}&q=is:review`, { study });
    expect(await rowNames()).toEqual(['¿Cuántas vértebras cervicales hay?']);
    await userEvent.click(within(await grid()).getAllByRole('row')[1]!);
    // Its information: the numbers and the history.
    const info = await screen.findByRole('region', { name: 'Información de la tarjeta' });
    expect(within(info).getByText('Repasos').nextSibling!.textContent).toBe('3');
    expect(within(info).getByText('Olvidos').nextSibling!.textContent).toBe('1');
    const history = await within(info).findByRole('table', { name: 'Historial de repasos' });
    expect(within(history).getByText('Bien')).toBeInTheDocument();
    expect(within(history).getByText('Aprendizaje')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Olvidar…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Olvidar' });
    await userEvent.click(
      within(dialog).getByRole('switch', {
        name: 'Reiniciar los contadores de repasos y olvidos',
      }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Olvidar' }));
    await waitFor(async () =>
      expect((await study.allCards())[0]).toMatchObject({ phase: 'new', reps: 0, lapses: 0 }),
    );
    await waitFor(() => expect(screen.getByText('0 tarjetas')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Deshacer' }));
    await waitFor(async () =>
      expect((await study.allCards())[0]).toMatchObject({ phase: 'review', reps: 3 }),
    );
    expect(await rowNames()).toEqual(['¿Cuántas vértebras cervicales hay?']);
  });

  it('rated: and introduced: read the history', async () => {
    const study = fullAnkiStudy();
    await reviewed(study);
    renderApp(`${TABLE}&q=rated:1`, { study });
    // The history arrives after the grid.
    await waitFor(async () =>
      expect(await rowNames()).toEqual(['¿Cuántas vértebras cervicales hay?']),
    );
    await searchFor('introduced:1 prop:reps=3');
    await waitFor(async () =>
      expect(await rowNames()).toEqual(['¿Cuántas vértebras cervicales hay?']),
    );
    await searchFor('rated:1:1');
    await waitFor(() => expect(screen.getByText('0 tarjetas')).toBeInTheDocument());
  });
});
