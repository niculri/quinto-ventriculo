// Tests a row of the table's grid and its header: the row's color by selection, flag and state, and the sort marks.

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SchedTiming } from '@qv/srs';
import { describe, expect, it, vi } from 'vitest';
import { browseCard } from '../../../../test/cardsFakes';
import type { BrowseCard } from '../../model/browseCards';
import { COLUMNS } from '../../model/columns';
import { GridHeader, GridRow } from '../GridRow';

const DEFS = COLUMNS.filter((c) => ['sortField', 'code', 'reps'].includes(c.key));
const TIMING = { now: 0 } as SchedTiming;

function row(card: BrowseCard, selected = false, current = false) {
  const onSelect = vi.fn();
  render(
    <GridRow
      card={card}
      index={2}
      defs={DEFS}
      template="1fr 1fr 1fr"
      selected={selected}
      current={current}
      onSelect={onSelect}
      timing={TIMING}
    />,
  );
  return { row: screen.getByRole('row'), onSelect };
}

describe('GridRow', () => {
  it('shows the card’s cells, the code in mono and the numbers to the right, at its index', async () => {
    const card = browseCard({ reps: 4 });
    const { row: r, onSelect } = row(card);
    const cells = within(r).getAllByRole('gridcell');
    expect(cells.map((c) => c.textContent)).toEqual(['Frente', 'T-PR-01-001.1', '4']);
    expect(cells[1]).toHaveClass('font-mono');
    expect(cells[2]).toHaveClass('text-right');
    expect(r).toHaveAttribute('aria-rowindex', '4');
    expect(r.style.top).toBe('68px');
    await userEvent.click(r);
    expect(onSelect).toHaveBeenCalledWith(card, expect.objectContaining({ shiftKey: false }));
  });

  it.each([
    [
      'a selected card is the brand’s color, even suspended and flagged',
      browseCard({ queue: 'suspended', flag: 1 }),
      true,
      'bg-brand-soft',
      '',
    ],
    [
      'a flagged card takes its flag’s color, not its state’s',
      browseCard({ queue: 'suspended', flag: 3 }),
      false,
      '',
      'color-mix(in srgb, rgb(67, 160, 71) 18%, transparent 82%)',
    ],
    ['a suspended card is yellow', browseCard({ queue: 'suspended' }), false, 'bg-[#fff8c5]', ''],
    ['a buried card is muted', browseCard({ queue: 'buried' }), false, 'text-muted', ''],
  ])('%s', (_, card, selected, klass, background) => {
    const { row: r } = row(card, selected);
    if (klass) expect(r).toHaveClass(klass);
    if (!selected && background) expect(r.className).not.toMatch(/bg-\[#fff8c5\]|text-muted/);
    expect(r.style.backgroundColor).toBe(background);
    expect(r).toHaveAttribute('aria-selected', String(selected));
  });

  it('a card in no special state has no color, and the current one has its outline', () => {
    const { row: r } = row(browseCard(), false, true);
    expect(r.className).not.toMatch(/bg-|text-muted/);
    expect(r).toHaveClass('outline-brand');
  });
});

describe('GridHeader', () => {
  it('marks the sorted column ascending or descending, and a click sorts by that column', async () => {
    const onSort = vi.fn();
    const { rerender } = render(
      <GridHeader
        defs={DEFS}
        template=""
        sort={{ column: 'code', descending: false }}
        onSort={onSort}
      />,
    );
    const sorts = () => screen.getAllByRole('columnheader').map((h) => h.getAttribute('aria-sort'));
    expect(sorts()).toEqual(['none', 'ascending', 'none']);
    expect(
      screen.getAllByRole('columnheader')[1]!.querySelector('.lucide-arrow-up'),
    ).not.toBeNull();
    rerender(
      <GridHeader
        defs={DEFS}
        template=""
        sort={{ column: 'reps', descending: true }}
        onSort={onSort}
      />,
    );
    expect(sorts()).toEqual(['none', 'none', 'descending']);
    expect(
      screen.getAllByRole('columnheader')[2]!.querySelector('.lucide-arrow-down'),
    ).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Repasos' })).toHaveClass('justify-end');
    await userEvent.click(screen.getByRole('button', { name: 'Código' }));
    expect(onSort).toHaveBeenCalledWith('code');
  });
});
