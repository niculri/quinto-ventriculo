// Tests the start of a final review: with nothing seen, and its two options with their counts.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { CATALOG } from '../../../../test/fixtures/catalog';
import { buildAnkiTree, hasPage } from '../../../catalog/model/tree';
import type { CourseDeckNode } from '../../../catalog/model/tree';
import type { CardRef } from '../../../progress/api/repository';
import { ChooseReview } from '../ChooseReview';
import { structure } from '../../../../test/dom';

const node = buildAnkiTree(CATALOG).nodes.find(
  (n): n is CourseDeckNode => n.depth === 3 && hasPage(n),
)!;
const card = (i: number): CardRef => ({ noteGuid: `n${i}`, ord: 0, deckId: '20' });

function view(all: CardRef[], hard: CardRef[]) {
  const chosen: CardRef[][] = [];
  const { container } = render(
    <MemoryRouter>
      <ChooseReview node={node} pools={{ all, hard }} onChoose={(c) => chosen.push(c)} />
    </MemoryRouter>,
  );
  return { container, chosen };
}

describe('choosing a final review', () => {
  it('with nothing seen, says so and goes back', () => {
    expect(structure(view([], []).container)).toMatchSnapshot();
  });

  it('offers everything seen and the hard ones, and an empty option does not work', async () => {
    const all = [card(1), card(2)];
    const { container, chosen } = view(all, []);
    expect(structure(container)).toMatchSnapshot();
    await userEvent.click(screen.getByRole('button', { name: /^Todo lo visto/ }));
    expect(chosen).toEqual([all]);
    expect(screen.getByRole('button', { name: /^Solo lo marcado/ })).toBeDisabled();
  });

  it('counts one card in the singular', () => {
    expect(structure(view([card(1)], [card(1)]).container)).toMatchSnapshot();
  });
});
