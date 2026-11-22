// Tests the cards page's table: the list's places while the student's options load, the notes of the unit chosen,
// and a selection with a card only the draft has, which says why nothing can be done to it.

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { cardKey } from '@qv/study';
import { renderWithServices } from '../../../../test/cardsUiRender';
import { fullAnkiStudy } from '../../../../test/fakes/repositories';
import { CARD_INDEX } from '../../../../test/fixtures/cards';
import { CATALOG } from '../../../../test/fixtures/catalog';
import { buildAnkiTree, hasPage } from '../../../catalog/model/tree';
import { cardsScope } from '../../../catalog/model/scope';
import { defaultPreferences } from '../../../progress/api/repository';
import type { StudyRepository } from '../../../progress/api/repository';
import { cardsData } from '../../model/cardsData';
import { CardsTable } from '../CardsTable';

const TREE = buildAnkiTree(CATALOG);
const NODE = TREE.nodes.find((n) => hasPage(n) && n.depth === 3)!;

function table({
  study = fullAnkiStudy() as StudyRepository,
  draftOnly = new Set<string>(),
  unitDecks = null as ReadonlySet<string> | null,
} = {}) {
  if (!hasPage(NODE)) throw new Error('the test deck has no page');
  const data = cardsData({
    list: [CARD_INDEX],
    rows: [],
    prefs: { ...defaultPreferences(), fullAnki: true },
    authorPresets: [],
    presets: [],
    settings: [],
    tree: TREE,
    nowMs: Date.now(),
    draftOnly,
  });
  renderWithServices(
    <CardsTable scope={cardsScope(CATALOG, NODE)} tree={TREE} data={data} unitDecks={unitDecks} />,
    {
      study,
      route: '/cards?view=table',
    },
  );
}

describe('CardsTable', () => {
  it('keeps the list’s places while the student’s options load', () => {
    table({ study: { ...fullAnkiStudy(), presets: () => new Promise(() => {}) } });
    expect(screen.queryByRole('grid')).toBeNull();
    expect(document.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('lists only the cards of the unit chosen', async () => {
    table({ unitDecks: new Set(['21']) });
    const grid = await screen.findByRole('grid', { name: 'Tarjetas' });
    expect(within(grid).getAllByRole('row')).toHaveLength(2);
    expect(screen.getByText(/^1 tarjetas?$/)).toBeInTheDocument();
  });

  it('a selection with a card only the draft has says so beside the count', async () => {
    table({ draftOnly: new Set([cardKey({ noteGuid: 'cloze-1', ord: 0 })]) });
    const grid = await screen.findByRole('grid', { name: 'Tarjetas' });
    const row = within(grid)
      .getAllByRole('row')
      .find((r) => r.textContent.includes('Cloze 1'))!;
    await userEvent.click(row);
    expect(screen.getByText(/solo están en el borrador/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Suspender' })).toBeDisabled();
  });
});
