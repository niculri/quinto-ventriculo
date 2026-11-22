// Tests the table's sidebar: what a click on a term searches with each modifier key, the groups of each mode, and
// which decks start folded in a big tree.

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { DeckNode } from '../../../catalog/model/tree';
import { BrowseSidebar } from '../BrowseSidebar';

function deck(id: string, name: string, depth: number, children: DeckNode[] = []): DeckNode {
  return { id, name, label: name.split('::').at(-1)!, depth, children } as unknown as DeckNode;
}

/** A course whose week has `n` lectures, each with a subdeck: 2 + 2n decks. */
function course(n: number) {
  const lectures = Array.from({ length: n }, (_, i) =>
    deck(`l${i}`, `R::C::S::L${i}`, 3, [deck(`d${i}`, `R::C::S::L${i}::D`, 4)]),
  );
  return deck('c', 'R::C', 1, [deck('s', 'R::C::S', 2, lectures)]);
}

function sidebar(full: boolean, courses = [course(1)]) {
  const onSearch = vi.fn();
  render(
    <BrowseSidebar
      courses={courses}
      noteTypes={[]}
      tags={['a::b']}
      full={full}
      onSearch={onSearch}
    />,
  );
  return onSearch;
}

describe('BrowseSidebar', () => {
  it('a click replaces the search; Mayús adds an «o», Ctrl or ⌘ a «y», Alt negates', () => {
    const onSearch = sidebar(true);
    const due = screen.getByRole('button', { name: 'Para hoy' });
    fireEvent.click(due);
    fireEvent.click(due, { shiftKey: true });
    fireEvent.click(due, { ctrlKey: true });
    fireEvent.click(due, { metaKey: true });
    fireEvent.click(due, { altKey: true, shiftKey: true });
    expect(onSearch.mock.calls).toEqual([
      ['is:due', 'replace', false],
      ['is:due', 'or', false],
      ['is:due', 'and', false],
      ['is:due', 'and', false],
      ['is:due', 'or', true],
    ]);
  });

  it('the simple mode has no note types, states nor flags, and «A repasar hoy»', () => {
    sidebar(false);
    expect(screen.getByRole('button', { name: 'A repasar hoy' })).toBeInTheDocument();
    expect(screen.queryByText('Tipos de nota')).toBeNull();
    expect(screen.queryByText('Banderas')).toBeNull();
  });

  it('a small tree starts with every deck open', () => {
    sidebar(true);
    expect(screen.getByRole('button', { name: 'D' })).toBeInTheDocument();
  });

  it('a tree of more than 40 decks starts with its lectures folded, and a click opens one', async () => {
    const onSearch = sidebar(true, [course(20)]);
    expect(screen.getByRole('button', { name: 'L0' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'D' })).toBeNull();
    const fold = screen.getAllByRole('button', { expanded: false })[0]!;
    await userEvent.click(fold);
    expect(screen.getByRole('button', { name: 'D' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'D' }));
    expect(onSearch).toHaveBeenCalledWith('deck:R::C::S::L0::D', 'replace', false);
  });
});
