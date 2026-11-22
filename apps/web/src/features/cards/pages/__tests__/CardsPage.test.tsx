// Tests the cards page's frame: its title (the course's name on a course's cards), the controls' places while the
// catalog it needs is not there, and an index it could not read.

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithServices } from '../../../../test/cardsUiRender';
import { fakeApi } from '../../../../test/fakes/api';
import { CATALOG } from '../../../../test/fixtures/catalog';
import { renderApp } from '../../../../test/render';
import { ApiRequestError } from '../../../../shared/lib/api';
import { localStudyRepository } from '../../../progress/api/repository';
import { buildAnkiTree, hasPage } from '../../../catalog/model/tree';
import { CardsPage } from '../CardsPage';

const PAGE = '/semesters/1/courses/anatomia-1/anki/certamen-1/cards';

describe('CardsPage', () => {
  it('a course’s cards are titled with the course’s name', async () => {
    renderApp('/semesters/1/courses/anatomia-1/anki/cards', { study: localStudyRepository(null) });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Tarjetas de Anatomía I' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('3 notas · 4 tarjetas')).toBeInTheDocument();
  });

  it('while the catalog is not there it keeps the places of the controls and the list', () => {
    const node = buildAnkiTree(CATALOG).nodes.find((n) => hasPage(n) && n.depth === 3)!;
    if (!hasPage(node)) throw new Error('the test deck has no page');
    renderWithServices(<CardsPage node={node} />, {
      api: fakeApi({ catalog: () => new Promise(() => {}) }),
    });
    expect(
      screen.getByRole('heading', { level: 1, name: 'Tarjetas de Certamen 1' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(document.querySelectorAll('[aria-hidden="true"] > div')).toHaveLength(10);
  });

  it('an index it could not read says so, and «Reintentar» reads it again', async () => {
    let fail = true;
    const base = fakeApi();
    const api = fakeApi({
      cardIndex: async (id, hash, signal) => {
        if (fail) throw new ApiRequestError(500, 'internal', 'Falló la red.');
        return base.cardIndex(id, hash, signal);
      },
    });
    renderApp(PAGE, { api, study: localStudyRepository(null) });
    const retry = await screen.findByRole('button', { name: 'Reintentar' });
    fail = false;
    await userEvent.click(retry);
    expect(await screen.findByText('3 notas · 4 tarjetas')).toBeInTheDocument();
  });
});
