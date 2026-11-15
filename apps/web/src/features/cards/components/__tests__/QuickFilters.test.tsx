// Tests the one-click filters of the table's simple mode: which are on, what each click searches, and the help.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QuickFilters } from '../QuickFilters';

describe('QuickFilters', () => {
  it('shows the states and «Marcadas», with the ones in the search pressed', () => {
    render(<QuickFilters query="vértebra is:new -flag:0" onSearch={() => {}} />);
    const group = screen.getByRole('group', { name: 'Filtros rápidos' });
    const buttons = [...group.querySelectorAll('button')];
    expect(buttons.map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['A repasar hoy', 'false'],
      ['Nuevas', 'true'],
      ['Aprendiendo', 'false'],
      ['En repaso', 'false'],
      ['Saltadas', 'false'],
      ['Ocultas', 'false'],
      [' Marcadas', 'true'],
    ]);
  });

  it('a state replaces the other states, and a click on one that is on takes it away', async () => {
    const onSearch = vi.fn();
    render(<QuickFilters query="vértebra is:new" onSearch={onSearch} />);
    await userEvent.click(screen.getByRole('button', { name: 'Aprendiendo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Nuevas' }));
    await userEvent.click(screen.getByRole('button', { name: 'Marcadas' }));
    expect(onSearch.mock.calls).toEqual([
      ['vértebra is:learn'],
      ['vértebra'],
      ['vértebra is:new -flag:0'],
    ]);
  });

  it('explains Anki’s syntax with examples', () => {
    render(<QuickFilters query="" onSearch={() => {}} />);
    expect(screen.getByText('Búsqueda avanzada').tagName).toBe('SUMMARY');
    expect(screen.getByText(/El buscador entiende/).innerHTML).toBe(
      'El buscador entiende la sintaxis de Anki. Por ejemplo: <code>vértebra atlas</code> (las dos palabras), <code>"arco del atlas"</code> (la frase), <code>-axis</code> (sin esa palabra), <code>tag:profe</code>, <code>deck:"…"</code>, <code>is:due</code>, <code>rated:7:1</code> (las que fallaste en 7 días), <code>prop:lapses&gt;3</code> y <code>A OR B</code>.',
    );
  });
});
