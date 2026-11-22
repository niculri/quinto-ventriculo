// Tests the table's toolbar: each action names what it would do to the current card, in the simple and the full mode,
// and the actions are off while busy, without a selection or with a card only the draft has.

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { browseCard } from '../../../../test/cardsFakes';
import { CATALOG } from '../../../../test/fixtures/catalog';
import { buildAnkiTree } from '../../../catalog/model/tree';
import type { BrowseCard } from '../../model/browseCards';
import type { ViewPrefs } from '../../hooks/useViewPrefs';
import { TableToolbar } from '../TableToolbar';

const VIEW: ViewPrefs = { mode: 'cards', columns: ['sortField'], sort: { column: 'sortField', descending: false } };
const DRAFT_ONLY = 'Hay tarjetas que solo están en el borrador: se miran, no se suspenden, entierran ni marcan.';

function toolbar({
  full = false,
  busy = false,
  count = 1,
  blocked = false,
  focus = browseCard() as BrowseCard | null,
} = {}) {
  const actions = {
    toggleSuspend: vi.fn(),
    toggleBury: vi.fn(),
    flag: vi.fn(),
    askForget: vi.fn(),
    undo: vi.fn(),
  };
  const onMode = vi.fn();
  render(
    <MemoryRouter>
      <TableToolbar full={full} view={VIEW} setView={vi.fn()} onMode={onMode} busy={busy} count={count} blocked={blocked} focus={focus} actions={actions} />
    </MemoryRouter>,
  );
  const bar = screen.getByRole('toolbar', { name: 'Acciones' });
  const names = () => within(bar).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent);
  return { bar, actions, onMode, names };
}

describe('TableToolbar', () => {
  it('in the simple mode: «No mostrar más», «Saltar por hoy» and «Marcar para revisar», with no cards/notes switch', async () => {
    const { names, actions } = toolbar();
    expect(names()).toEqual(['Columnas', 'No mostrar más', 'Saltar por hoy', 'Marcar para revisar', 'Deshacer']);
    await userEvent.click(screen.getByRole('button', { name: 'Marcar para revisar' }));
    expect(actions.flag).toHaveBeenCalledWith(1);
  });

  it('in the simple mode, a hidden, skipped and marked card offers to undo each', async () => {
    const { names, actions } = toolbar({ focus: browseCard({ queue: 'suspended', flag: 4 }) });
    expect(names()).toEqual(['Columnas', 'Volver a mostrar', 'Saltar por hoy', 'Quitar la marca', 'Deshacer']);
    await userEvent.click(screen.getByRole('button', { name: 'Quitar la marca' }));
    expect(actions.flag).toHaveBeenCalledWith(4);
  });

  it('in the full mode: Anki’s names, the flags menu and «Olvidar…», and the cards/notes switch', async () => {
    const { names, actions, onMode } = toolbar({ full: true, focus: browseCard({ queue: 'buried' }) });
    expect(names()).toEqual(['Tarjetas', 'Notas', 'Columnas', 'Suspender', 'Desenterrar', 'Marcar', 'Olvidar…', 'Deshacer']);
    expect(screen.getByRole('button', { name: 'Tarjetas' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Notas' }));
    await userEvent.click(screen.getByRole('button', { name: 'Olvidar…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Suspender' }));
    await userEvent.click(screen.getByRole('button', { name: 'Desenterrar' }));
    expect(onMode).toHaveBeenCalledWith('notes');
    expect([actions.askForget, actions.toggleSuspend, actions.toggleBury].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
  });

  it('in the full mode, a suspended card is «Quitar suspensión», and a buried one in the simple mode «Mostrar hoy»', () => {
    toolbar({ full: true, focus: browseCard({ queue: 'suspended' }) });
    expect(screen.getByRole('button', { name: 'Quitar suspensión' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enterrar' })).toBeInTheDocument();
  });

  it('a buried card in the simple mode is «Mostrar hoy»', () => {
    toolbar({ focus: browseCard({ queue: 'buried' }) });
    expect(screen.getByRole('button', { name: 'Mostrar hoy' })).toBeInTheDocument();
  });

  it.each([
    ['busy', { busy: true }, true],
    ['without a selection', { count: 0 }, false],
    ['with a card only the draft has', { blocked: true }, false],
  ])('%s, every action is off; «Deshacer» only while busy', (_, op, undoOff) => {
    toolbar({ full: true, ...op });
    for (const name of ['Suspender', 'Enterrar', 'Marcar', 'Olvidar…']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: 'Deshacer' }).hasAttribute('disabled')).toBe(undoOff);
  });

  it('a card only the draft has says why on each action', () => {
    toolbar({ blocked: true });
    for (const name of ['No mostrar más', 'Saltar por hoy', 'Marcar para revisar']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('title', DRAFT_ONLY);
    }
    expect(screen.getByRole('button', { name: 'Deshacer' })).not.toHaveAttribute('title');
  });

  it('without a current card, its names are those of a card to suspend, skip and mark, and the flag marks for review', async () => {
    const { names, actions } = toolbar({ focus: null });
    expect(names()).toEqual(['Columnas', 'No mostrar más', 'Saltar por hoy', 'Marcar para revisar', 'Deshacer']);
    await userEvent.click(screen.getByRole('button', { name: 'Marcar para revisar' }));
    expect(actions.flag).toHaveBeenCalledWith(1);
    expect(screen.queryByRole('link', { name: 'Ir al mazo' })).toBeNull();
  });

  it('«Ir al mazo» only when the current card’s deck has a page', () => {
    const tree = buildAnkiTree(CATALOG);
    const page = [...tree.byId.values()].find((n) => n.id === '20')!;
    toolbar({ focus: browseCard({ deck: page }) });
    expect(screen.getByRole('link', { name: 'Ir al mazo' })).toHaveAttribute(
      'href',
      '/semesters/1/courses/anatomia-1/anki/certamen-1/s1-semana-de-prueba/mazo-de-prueba',
    );
  });

  it('a deck without a page (a semester) has no «Ir al mazo»', () => {
    const tree = buildAnkiTree(CATALOG);
    const root = tree.nodes.find((n) => n.parentId === null)!;
    toolbar({ focus: browseCard({ deck: root }) });
    expect(screen.queryByRole('link', { name: 'Ir al mazo' })).toBeNull();
  });
});
