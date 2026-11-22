// Tests a card's material from the catalog: none until the catalog arrives, and none for a card without a deck.

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Catalog } from '@qv/schema';
import { ApiClientContext } from '../../../../shared/hooks/useApi';
import { fakeApi } from '../../../../test/fakes/api';
import { CATALOG } from '../../../../test/fixtures/catalog';
import { useCardMaterial } from '../useCardMaterial';

function withMaterial(): Catalog {
  const copy = structuredClone(CATALOG);
  const assessment = copy.semesters[0]!.courses[0]!.assessments[0]!;
  assessment.notes = [
    {
      ...copy.semesters[1]!.courses[0]!.assessments[0]!.notes[0]!,
      slug: 'mazo-de-prueba',
      courseId: 'anatomia-1',
      assessmentId: assessment.id,
      practice: { deck: 'Mazo de prueba' },
    },
  ];
  return copy;
}

function wrapperWith(catalog: () => Promise<Catalog>) {
  const client = new QueryClient();
  const api = fakeApi({ catalog });
  return ({ children }: { children: ReactNode }) => (
    <ApiClientContext value={api}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </ApiClientContext>
  );
}

describe('the material of a card', () => {
  it('is none while the catalog loads, and the article once it arrives', async () => {
    let arrive = (_: Catalog) => {};
    const wrapper = wrapperWith(() => new Promise((r) => (arrive = r)));
    const { result } = renderHook(() => useCardMaterial('20'), { wrapper });
    expect(result.current).toBeNull();
    arrive(withMaterial());
    await waitFor(() =>
      expect(result.current?.notePath).toBe('/semesters/1/courses/anatomia-1/notes/mazo-de-prueba'),
    );
  });

  it('is none for a card without a deck yet, or of a deck without an article', async () => {
    const wrapper = wrapperWith(async () => withMaterial());
    const none = renderHook(() => useCardMaterial(undefined), { wrapper });
    const other = renderHook(() => useCardMaterial('5'), { wrapper });
    const known = renderHook(() => useCardMaterial('20'), { wrapper });
    await waitFor(() => expect(known.result.current).not.toBeNull());
    expect([none.result.current, other.result.current]).toEqual([null, null]);
  });
});
