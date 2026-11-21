// Tests the table's action runner: busy while it works and free again after, whether it worked or not.
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudyRepositoryContext } from '../../../progress/api/context';
import { studyKeys } from '../../../progress/queries';
import type { StudyRepository } from '../../../progress/api/repository';
import { useActionRunner } from '../useActionRunner';

const CARD = { noteGuid: 'n1', ord: 0, deckId: 'd1' };

function runner(repository: Partial<StudyRepository>, full = false) {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StudyRepositoryContext value={repository as StudyRepository}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </StudyRepositoryContext>
  );
  return { invalidate, ...renderHook(() => useActionRunner(full), { wrapper }) };
}

afterEach(() => vi.useRealTimers());

describe('an action', () => {
  it('is busy while it saves, then reads the progress again, says it and is free', async () => {
    let finish = () => {};
    const suspend = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const { result, invalidate } = runner({ suspend });
    let done: Promise<void> = Promise.resolve();
    act(() => {
      done = result.current.act('Suspendidas', { kind: 'suspend', cards: [CARD] });
    });
    await waitFor(() => expect(result.current.busy).toBe(true));
    expect(invalidate).not.toHaveBeenCalled();
    finish();
    await act(() => done);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: studyKeys.all });
    expect(result.current).toMatchObject({ busy: false, toast: 'Suspendidas', problem: null });
  });

  it('that fails says why and is free again, with no toast', async () => {
    const suspend = vi.fn().mockRejectedValue(new Error('No se pudo guardar tu repaso'));
    const { result, invalidate } = runner({ suspend });
    await act(() => result.current.act('Suspendidas', { kind: 'suspend', cards: [CARD] }));
    expect(invalidate).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({
      busy: false,
      toast: null,
      problem: 'No se pudo guardar tu repaso',
    });
  });

  it('that fails with something that is not an Error says the generic reason', async () => {
    const suspend = vi.fn().mockRejectedValue('boom');
    const { result } = runner({ suspend });
    await act(() => result.current.act('Suspendidas', { kind: 'suspend', cards: [CARD] }));
    expect(result.current).toMatchObject({ busy: false, problem: 'No se pudo hacer.' });
  });

  it('whose progress could not be read again says why, with no toast', async () => {
    const { result, invalidate } = runner({ suspend: vi.fn().mockResolvedValue(undefined) });
    invalidate.mockRejectedValue(new Error('offline'));
    await act(() => result.current.act('Suspendidas', { kind: 'suspend', cards: [CARD] }));
    expect(result.current).toMatchObject({ busy: false, toast: null, problem: 'offline' });
  });

  it('clears the previous problem when it starts, and the toast after 3 seconds', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const suspend = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined);
    const { result } = runner({ suspend });
    await act(() => result.current.act('Suspendidas', { kind: 'suspend', cards: [CARD] }));
    expect(result.current.problem).toBe('offline');
    await act(() => result.current.act('Suspendidas', { kind: 'suspend', cards: [CARD] }));
    expect(result.current).toMatchObject({ problem: null, toast: 'Suspendidas' });
    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(result.current.toast).toBe('Suspendidas');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.toast).toBeNull();
  });
});

describe('«Deshacer»', () => {
  it('says what it undid, with the labels of the mode, and is free again', async () => {
    const undo = vi.fn().mockResolvedValue({ action: 'suspend' });
    const { result, invalidate } = runner({ undo }, true);
    await act(async () => result.current.undo());
    await waitFor(() => expect(result.current.toast).toMatch(/^Deshecho: /));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: studyKeys.all });
    expect(result.current.busy).toBe(false);
  });

  it('with nothing to undo says so', async () => {
    const { result } = runner({ undo: vi.fn().mockResolvedValue(null) });
    await act(async () => result.current.undo());
    await waitFor(() => expect(result.current.toast).toBe('No hay nada que deshacer'));
    expect(result.current.busy).toBe(false);
  });

  it('that fails says why and is free again', async () => {
    const { result } = runner({ undo: vi.fn().mockRejectedValue('boom') });
    await act(async () => result.current.undo());
    await waitFor(() => expect(result.current.problem).toBe('No se pudo deshacer.'));
    expect(result.current).toMatchObject({ busy: false, toast: null });
  });
});
