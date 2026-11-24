// Tests the wait for an earlier study session's changes: none when nothing is left to write, and until they are
// written (reading the progress again then) when a session was left with some.
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { DECK } from '../../../../test/fixtures/deck';
import { localStudyRepository } from '../../../progress/api/repository';
import { studyKeys } from '../../../progress/queries';
import { SaveQueue } from '../../api/SaveQueue';
import { useEarlierSaves } from '../useEarlierSaves';

function mount(client: QueryClient) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useEarlierSaves(), { wrapper });
}

it('with nothing left to write there is nothing to wait for', () => {
  const client = new QueryClient();
  const reset = vi.spyOn(client, 'resetQueries');
  expect(mount(client).result.current).toBe(false);
  expect(reset).not.toHaveBeenCalled();
});

it('waits for a session left with something to write, then reads the progress again; a screen that was left is not told', async () => {
  const local = localStudyRepository(null);
  let release = () => {};
  const released = new Promise<void>((resolve) => (release = resolve));
  const queue = new SaveQueue(
    {
      ...local,
      setFlag: async (card, flag) => {
        await released;
        return local.setFlag(card, flag);
      },
    },
    new Map(),
    [0],
    () => {},
    () => {},
    () => {},
  );
  const card = { noteGuid: DECK.cards[0]!.noteGuid, ord: 0, deckId: '20' };
  queue.handle({ kind: 'setFlag', id: '1.1', card, flag: 2 });

  const client = new QueryClient();
  const reset = vi.spyOn(client, 'resetQueries');
  const left = mount(client);
  const here = mount(client);
  expect([left.result.current, here.result.current]).toEqual([true, true]);
  left.unmount();

  await act(async () => {
    release();
    await queue.saved();
  });
  await waitFor(() => expect(here.result.current).toBe(false));
  expect(reset).toHaveBeenCalledWith({ queryKey: studyKeys.all });
  expect(left.result.current).toBe(true);
  expect(mount(client).result.current).toBe(false);
});
