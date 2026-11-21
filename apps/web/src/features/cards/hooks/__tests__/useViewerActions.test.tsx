// Tests the viewer's actions: each is shown at once, goes back if saving fails, and leaves the viewer free either way.
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { CardSummary } from '@qv/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudyRepositoryContext } from '../../../progress/api/context';
import { studyKeys } from '../../../progress/queries';
import type { StudyRepository } from '../../../progress/api/repository';
import type { BrowseCard } from '../../model/browseCards';
import { useViewerActions } from '../useViewerActions';

const CARD = { noteGuid: 'n1', ord: 0, deckId: 'd1' } as CardSummary;
const REF = { noteGuid: 'n1', ord: 0, deckId: 'd1' };

function viewer(repository: Partial<StudyRepository>, info?: Partial<BrowseCard>) {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StudyRepositoryContext value={repository as StudyRepository}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </StudyRepositoryContext>
  );
  return {
    invalidate,
    ...renderHook(() => useViewerActions(CARD, info as BrowseCard | undefined), { wrapper }),
  };
}

afterEach(() => vi.useRealTimers());

describe('marking', () => {
  it('shows the mark at once, says it, reads the progress again and leaves the viewer free', async () => {
    let finish = () => {};
    const setFlag = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const { result, invalidate } = viewer({ setFlag }, { flag: 0, queue: 'new' });
    act(() => {
      result.current.toggleFlag();
    });
    await waitFor(() => expect(result.current).toMatchObject({ flag: 1, busy: true }));
    expect(setFlag).toHaveBeenCalledWith(REF, 1);
    finish();
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: studyKeys.all });
    expect(result.current).toMatchObject({ flag: 1, message: 'Marcada para revisar' });
  });

  it('goes back when saving fails, says so and leaves the viewer free', async () => {
    const setFlag = vi.fn().mockRejectedValue(new Error('offline'));
    const { result, invalidate } = viewer({ setFlag }, { flag: 0, queue: 'new' });
    act(() => {
      result.current.toggleFlag();
    });
    await waitFor(() =>
      expect(result.current).toMatchObject({
        flag: 0,
        busy: false,
        message: 'No se pudo guardar. Intenta de nuevo.',
      }),
    );
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('takes the mark away when it is there', async () => {
    const setFlag = vi.fn().mockResolvedValue(undefined);
    const { result } = viewer({ setFlag }, { flag: 1, queue: 'new' });
    act(() => {
      result.current.toggleFlag();
    });
    await waitFor(() => expect(result.current.message).toBe('Sin marca'));
    expect(setFlag).toHaveBeenCalledWith(REF, 0);
    expect(result.current.flag).toBe(0);
  });
});

describe('hiding', () => {
  it('hides and shows again with the repository’s own actions', async () => {
    const suspend = vi.fn().mockResolvedValue(undefined);
    const unsuspend = vi.fn().mockResolvedValue(undefined);
    const { result } = viewer({ suspend, unsuspend }, { flag: 0, queue: 'new' });
    act(() => {
      result.current.toggleHidden();
    });
    await waitFor(() => expect(result.current.message).toBe('No se mostrará más'));
    expect(suspend).toHaveBeenCalledWith([REF], false);
    expect(result.current.hidden).toBe(true);
    act(() => {
      result.current.toggleHidden();
    });
    await waitFor(() => expect(result.current.message).toBe('Se mostrará de nuevo'));
    expect(unsuspend).toHaveBeenCalledWith([REF]);
    expect(result.current.hidden).toBe(false);
  });

  it('goes back when saving fails and leaves the viewer free', async () => {
    const suspend = vi.fn().mockRejectedValue(new Error('offline'));
    const { result } = viewer({ suspend }, { flag: 0, queue: 'new' });
    act(() => {
      result.current.toggleHidden();
    });
    await waitFor(() =>
      expect(result.current).toMatchObject({
        hidden: false,
        busy: false,
        message: 'No se pudo guardar. Intenta de nuevo.',
      }),
    );
  });
});

describe('the message', () => {
  it('goes away after 3 seconds', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { result } = viewer({ setFlag: vi.fn().mockResolvedValue(undefined) });
    await act(async () => result.current.toggleFlag());
    expect(result.current.message).toBe('Marcada para revisar');
    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(result.current.message).toBe('Marcada para revisar');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.message).toBeNull();
  });
});
