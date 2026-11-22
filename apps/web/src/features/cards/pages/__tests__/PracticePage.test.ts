// Tests «Practicar estas» when there is no round: cards it could not read, an assessment without an index yet, and
// the way back to the cards with the same filters.

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fakeApi } from '../../../../test/fakes/api';
import { CATALOG } from '../../../../test/fixtures/catalog';
import { renderApp } from '../../../../test/render';
import { ApiRequestError } from '../../../../shared/lib/api';
import { localStudyRepository } from '../../../progress/api/repository';

const PRACTICE = '/semesters/1/courses/anatomia-1/anki/certamen-1/cards/practice';

describe('PracticePage', () => {
  it('cards it could not read say so, and «Reintentar» reads them again and starts the round', async () => {
    let fail = true;
    const base = fakeApi();
    const api = fakeApi({
      cardIndex: async (id, hash, signal) => {
        if (fail) throw new ApiRequestError(500, 'internal', 'Falló la red.');
        return base.cardIndex(id, hash, signal);
      },
    });
    renderApp(PRACTICE, { api, study: localStudyRepository(null) });
    const retry = await screen.findByRole('button', { name: 'Reintentar' });
    expect(screen.getByRole('link', { name: 'Volver a Tarjetas' })).toHaveAttribute(
      'href',
      '/semesters/1/courses/anatomia-1/anki/certamen-1/cards',
    );
    fail = false;
    await userEvent.click(retry);
    expect(await screen.findByRole('region', { name: /Frente de la tarjeta/ })).toBeInTheDocument();
  });

  it('an assessment without an index yet has nothing to practice, and goes back with its filters', async () => {
    const withoutIndex = structuredClone(CATALOG);
    delete withoutIndex.semesters[0]!.courses[0]!.assessments[0]!.cardIndex;
    renderApp(`${PRACTICE}?state=new`, {
      api: fakeApi({ catalog: async () => withoutIndex }),
      study: localStudyRepository(null),
    });
    expect(await screen.findByText('Nada que practicar')).toBeInTheDocument();
    for (const link of screen.getAllByRole('link', { name: /Volver a las tarjetas/ })) {
      expect(link).toHaveAttribute(
        'href',
        '/semesters/1/courses/anatomia-1/anki/certamen-1/cards?state=new',
      );
    }
  });

  it('cards that changed since the page was opened have nothing to practice', async () => {
    renderApp(PRACTICE, {
      api: fakeApi({
        cardIndex: async () => {
          throw new ApiRequestError(404, 'not_found', 'Las tarjetas de este certamen cambiaron.');
        },
      }),
      study: localStudyRepository(null),
    });
    expect(await screen.findByText('Nada que practicar')).toBeInTheDocument();
  });
});
