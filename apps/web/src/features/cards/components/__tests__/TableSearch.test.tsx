// Tests the table's search box: its name and hint in each mode, the one-click filters only in the simple mode, and
// what is wrong with a search.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TableSearch } from '../TableSearch';

function search(full: boolean, error: string | null = null) {
  const props = {
    onText: vi.fn(),
    onSubmit: vi.fn((e: { preventDefault: () => void }) => e.preventDefault()),
    onFilters: vi.fn(),
    onSearch: vi.fn(),
  };
  render(
    <TableSearch full={full} text="" query="" error={error} inputRef={createRef()} {...props} />,
  );
  return props;
}

describe('TableSearch', () => {
  it('in the simple mode it searches by text or code, with the one-click filters', async () => {
    const p = search(false);
    const box = screen.getByRole('searchbox', { name: 'Buscar tarjetas' });
    expect(box).toHaveAttribute('placeholder', 'Buscar por texto o código');
    expect(screen.getByRole('group', { name: 'Filtros rápidos' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Nuevas' }));
    expect(p.onSearch.mock.calls[0]![0].trim()).toBe('is:new');
  });

  it('in the full mode it takes Anki’s syntax, without the one-click filters', async () => {
    const p = search(true);
    const box = screen.getByRole('searchbox', { name: 'Buscar (sintaxis de Anki)' });
    expect(box).toHaveAttribute('placeholder', 'deck:"…" tag:… is:due vértebra');
    expect(screen.queryByRole('group', { name: 'Filtros rápidos' })).toBeNull();
    await userEvent.type(box, 'a');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Barra lateral' }));
    expect([p.onText.mock.calls, p.onSubmit.mock.calls.length, p.onFilters.mock.calls.length]).toEqual([[['a']], 1, 1]);
  });

  it('a search it cannot run says why', () => {
    search(true, 'Falta cerrar un paréntesis');
    expect(screen.getByText('Falta cerrar un paréntesis')).toBeInTheDocument();
  });
});
