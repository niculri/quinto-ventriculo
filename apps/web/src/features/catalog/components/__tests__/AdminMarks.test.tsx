// Tests a deck's mark in the admin mode: what its parent already says is left out, and a deck at the top says it all.
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import type { Catalog } from '@qv/schema';
import { adminKey } from '@qv/schema/http';
import { ApiClientContext } from '../../../../shared/hooks/useApi';
import { fakeApi } from '../../../../test/fakes/api';
import { CATALOG } from '../../../../test/fixtures/catalog';
import { DeckMark } from '../AdminMarks';

const ADMIN: Catalog = {
  ...CATALOG,
  adminOnly: {
    [adminKey('deck', 'p')]: ['draft'],
    [adminKey('deck', 'c')]: ['draft', 'hiddenCourse'],
  },
};

function show(deck: { id: string; parentId: string | null }) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <ApiClientContext value={fakeApi({ catalog: async () => ADMIN })}>
        <DeckMark deck={deck} />
      </ApiClientContext>
    </QueryClientProvider>,
  );
}

const marks = async () => {
  const mark = await screen.findByText((_, el) => el?.hasAttribute('data-admin-mark') ?? false);
  return [...mark.children].map((c) => c.textContent);
};

describe('DeckMark', () => {
  it('under a draft parent, only what the deck adds', async () => {
    show({ id: 'c', parentId: 'p' });
    expect(await marks()).toEqual(['Ramo apagado']);
  });

  it('a deck at the top of the list shows all its reasons', async () => {
    show({ id: 'c', parentId: null });
    expect(await marks()).toEqual(['Borrador', 'Ramo apagado']);
  });
});
