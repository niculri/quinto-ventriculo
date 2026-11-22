// Tests the table's grid: it draws only the rows in view and follows the scroll, and Ctrl/⌘+A selects every row.

import { fireEvent, render, screen } from '@testing-library/react';
import type { SchedTiming } from '@qv/srs';
import { describe, expect, it, vi } from 'vitest';
import { browseCard } from '../../../../test/cardsFakes';
import { CardGrid } from '../CardGrid';

const LIST = Array.from({ length: 200 }, (_, i) =>
  browseCard({ key: `n${i}/0`, note: { guid: `n${i}`, sortField: `Nota ${i}` } }),
);

function grid() {
  const onSelectAll = vi.fn();
  const onSelect = vi.fn();
  render(
    <CardGrid
      list={LIST}
      columns={['sortField']}
      sort={{ column: 'sortField', descending: false }}
      onSort={vi.fn()}
      selected={new Set()}
      current={null}
      onSelect={onSelect}
      onSelectAll={onSelectAll}
      timing={{ now: 0 } as SchedTiming}
      label="Tarjetas"
    />,
  );
  const g = screen.getByRole('grid', { name: 'Tarjetas' });
  const drawn = () =>
    [...g.querySelectorAll('[role="row"][aria-rowindex]')]
      .map((r) => Number(r.getAttribute('aria-rowindex')))
      .filter((i) => i > 1);
  return { g, drawn, onSelectAll, onSelect };
}

describe('CardGrid', () => {
  it('draws the rows in view and a few more, and the scroll moves them', () => {
    const { g, drawn } = grid();
    expect(drawn()[0]).toBe(2);
    expect(drawn().length).toBeLessThan(60);
    g.scrollTop = 34 * 150;
    fireEvent.scroll(g);
    expect(drawn()[0]).toBe(142);
    expect(drawn()).toContain(152);
  });

  it('Ctrl or ⌘ with A selects every row, and moves nothing', () => {
    const { g, onSelectAll, onSelect } = grid();
    fireEvent.keyDown(g, { key: 'a', ctrlKey: true });
    fireEvent.keyDown(g, { key: 'A', metaKey: true });
    expect(onSelectAll).toHaveBeenCalledTimes(2);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
