// Tests changing the configuration a deck uses: what is saved, and that «saving» ends whether it worked or not.
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { StudyRepositoryContext } from '../../../progress/api/context';
import type { StudyRepository } from '../../../progress/api/repository';
import type { DeckNode } from '../../../catalog/model/tree';
import { useDeckPreset } from '../useDeckPreset';

vi.mock('../../../catalog/hooks/useCatalog', () => ({
  useCatalog: () => ({
    data: {
      anki: {
        presets: [
          { name: 'Certamen', config: {} },
          { name: 'Extras', config: {} },
        ],
      },
    },
  }),
}));
vi.mock('../../../progress/queries', async (original) => ({
  ...(await original<object>()),
  useUserPresets: () => ({ data: [{ id: 'u1', name: 'Mía', replaces: null, config: {} }] }),
  useDeckSettings: () => ({ data: [] }),
}));

const NODE = { id: 'd1', preset: 'Certamen' } as DeckNode;

function deck(setDeckPreset: StudyRepository['setDeckPreset']) {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StudyRepositoryContext value={{ setDeckPreset } as StudyRepository}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </StudyRepositoryContext>
  );
  return { invalidate, ...renderHook(() => useDeckPreset(NODE), { wrapper }) };
}

const own = (result: { current: ReturnType<typeof useDeckPreset> }) => result.current!;

describe('choosing a configuration for a deck', () => {
  it('offers the author’s and the student’s, and starts from the deck’s own', () => {
    const { result } = deck(vi.fn());
    expect(own(result).choices.map((c) => c.name)).toEqual(['Certamen', 'Extras', 'Mía']);
    expect(own(result).current.name).toBe('Certamen');
  });

  it('saves the student’s by its id, another of the author’s by its name, and the deck’s own as none', async () => {
    const setDeckPreset = vi.fn().mockResolvedValue(undefined);
    const { result, invalidate } = deck(setDeckPreset);
    await act(() => own(result).choose('user:u1'));
    await act(() => own(result).choose('author:Extras'));
    await act(() => own(result).choose('author:Certamen'));
    expect(setDeckPreset.mock.calls).toEqual([
      ['d1', { presetId: 'u1' }],
      ['d1', { authorPreset: 'Extras' }],
      ['d1', null],
    ]);
    expect(invalidate).toHaveBeenCalledTimes(3);
    expect(own(result)).toMatchObject({ saving: false, error: null });
  });

  it('is saving until the repository answers', async () => {
    let finish = () => {};
    const setDeckPreset = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const { result } = deck(setDeckPreset);
    let done: Promise<void> = Promise.resolve();
    act(() => {
      done = own(result).choose('user:u1');
    });
    await vi.waitFor(() => expect(own(result).saving).toBe(true));
    finish();
    await act(() => done);
    expect(own(result).saving).toBe(false);
  });

  it('that fails says why and is not saving any more; the next try clears it', async () => {
    const setDeckPreset = vi
      .fn()
      .mockRejectedValueOnce(new Error('sin conexión'))
      .mockRejectedValueOnce('boom')
      .mockResolvedValueOnce(undefined);
    const { result, invalidate } = deck(setDeckPreset);
    await act(() => own(result).choose('user:u1'));
    expect(own(result)).toMatchObject({ saving: false, error: 'sin conexión' });
    await act(() => own(result).choose('user:u1'));
    expect(own(result)).toMatchObject({ saving: false, error: 'No se pudo guardar.' });
    expect(invalidate).not.toHaveBeenCalled();
    await act(() => own(result).choose('user:u1'));
    expect(own(result)).toMatchObject({ saving: false, error: null });
  });

  it('ignores a configuration that does not exist', async () => {
    const setDeckPreset = vi.fn();
    const { result } = deck(setDeckPreset);
    await act(() => own(result).choose('user:nope'));
    expect(setDeckPreset).not.toHaveBeenCalled();
    expect(own(result).saving).toBe(false);
  });
});
