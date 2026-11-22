// Tests the study session hook: what it asks the repository once (also in StrictMode), the toast's timer, the
// browser's «leave?» and the look for more cards.
import { StrictMode, startTransition } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_PLAN, treeDecks } from '@qv/study';
import type { StudyData } from '@qv/study';
import { ApiClientContext } from '../../../../shared/hooks/useApi';
import { CATALOG } from '../../../../test/fixtures/catalog';
import { DECK } from '../../../../test/fixtures/deck';
import { fakeApi } from '../../../../test/fakes/api';
import { StudyRepositoryContext } from '../../../progress/api/context';
import { defaultPreferences, localStudyRepository } from '../../../progress/api/repository';
import type { StudyRepository } from '../../../progress/api/repository';
import { cardQuery } from '../../../decks/api/queries';
import {
  useCardTurn,
  useDoneSummary,
  useSessionLifecycle,
  useStudySession,
} from '../useStudySession';

const data = (): StudyData => ({
  deck: DECK,
  decks: treeDecks(CATALOG.anki.decks),
  authorPresets: DECK.presets,
  rows: new Map(),
  answers: [],
  prefs: { ...defaultPreferences('America/Santiago'), fullAnki: true },
  presets: [],
  settings: [],
  plan: { ...EMPTY_PLAN, activations: [{ deckId: '5', active: true }] },
});

function mount(
  repository: StudyRepository,
  strict = true,
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  const wrapper = ({ children }: { children: ReactNode }) => {
    const tree = (
      <ApiClientContext value={fakeApi()}>
        <StudyRepositoryContext value={repository}>
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        </StudyRepositoryContext>
      </ApiClientContext>
    );
    return strict ? <StrictMode>{tree}</StrictMode> : tree;
  };
  const hook = renderHook(
    () => {
      const session = useStudySession(data(), DECK.id);
      useSessionLifecycle(session.act, session.saves);
      return session;
    },
    { wrapper },
  );
  return { ...hook, client };
}

const settle = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });

beforeEach(() =>
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval'] }),
);
afterEach(() => vi.useRealTimers());

describe('the study session hook in StrictMode', () => {
  it('asks the repository for each answer, flag and burying once, whatever the double mount and render', async () => {
    const local = localStudyRepository(null);
    const calls = {
      recordReview: vi.spyOn(local, 'recordReview'),
      setFlag: vi.spyOn(local, 'setFlag'),
      bury: vi.spyOn(local, 'bury'),
    };
    const { result } = mount(local);
    await settle();
    expect(result.current.state.shown).not.toBeNull();

    act(() => result.current.act.reveal());
    act(() => result.current.act.answer(3));
    act(() => result.current.act.flag(2));
    act(() => result.current.act.hide('bury_card'));
    await settle();
    await act(() => result.current.saves.saved());

    expect(calls.recordReview).toHaveBeenCalledTimes(1);
    expect(calls.setFlag).toHaveBeenCalledTimes(1);
    expect(calls.bury).toHaveBeenCalledTimes(1);
    expect(result.current.state.outbox.filter((c) => c.kind === 'saveAnswer')).toHaveLength(1);
  });

  it('opens on the first card, and with nothing left looks for more every 15 s', async () => {
    const { result } = mount(localStudyRepository(null));
    await settle();
    expect(result.current.state.shown).not.toBeNull();
    for (let i = 0; i < 10 && result.current.state.shown; i++) {
      act(() => result.current.act.hide('suspend_note'));
    }
    expect(result.current.state.shown).toBeNull();
    const lookedAt = result.current.state.now;
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    expect(result.current.state.now - lookedAt).toBe(15_000);
  });

  it('reads the deck’s figures again once everything is saved, when the screen goes away', async () => {
    const { result, unmount, client } = mount(localStudyRepository(null));
    await settle();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    act(() => result.current.act.reveal());
    act(() => result.current.act.answer(3));
    unmount();
    await settle();
    expect(invalidate).toHaveBeenCalled();
  });
});

describe('the cards that come up soon', () => {
  const prefetched = (client: QueryClient) =>
    vi.spyOn(client, 'prefetchQuery').mockResolvedValue(undefined);

  it('asks for the content of each of them when the session looks for a card, once per request, also in StrictMode', async () => {
    for (const strict of [false, true]) {
      const client = new QueryClient();
      const prefetch = prefetched(client);
      const { result } = mount(localStudyRepository(null), strict, client);
      await settle();
      act(() => result.current.act.reveal());
      act(() => result.current.act.answer(3));
      await settle();
      const asked = result.current.state.outbox.flatMap((c) =>
        c.kind === 'prefetch' ? c.entries : [],
      );
      expect(asked.length).toBeGreaterThan(0);
      expect(prefetch.mock.calls.map(([options]) => options.queryKey)).toEqual(
        asked.map((e) => cardQuery(fakeApi(), e.noteGuid, e.ord).queryKey),
      );
    }
  });
});

describe('an answer lost to the connection', () => {
  it('is tried again after 1 s and then after 3 s more, and the session goes on if one gets through', async () => {
    const local = localStudyRepository(null);
    let calls = 0;
    const flaky: StudyRepository = {
      ...local,
      recordReview: (input) =>
        ++calls < 3
          ? Promise.reject(new Error('No se pudo guardar tu respuesta: red'))
          : local.recordReview(input),
    };
    const { result } = mount(flaky);
    await settle();
    act(() => result.current.act.reveal());
    act(() => result.current.act.answer(3));
    await act(() => vi.advanceTimersByTimeAsync(999));
    expect(calls).toBe(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(calls).toBe(2);
    await act(() => vi.advanceTimersByTimeAsync(2999));
    expect(calls).toBe(2);
    await act(() => vi.advanceTimersByTimeAsync(1));
    await act(() => result.current.saves.saved());
    expect(calls).toBe(3);
    expect(result.current.state.failure).toBeNull();
  });
});

describe('the toast of the session', () => {
  it('goes away 3 s after it appeared, and a newer one is not taken away by the older one’s timer', async () => {
    const { result } = mount(localStudyRepository(null));
    await settle();
    act(() => result.current.act.undo());
    const first = result.current.state.toast;
    expect(first).toMatchObject({ kind: 'nothingToUndo' });
    await act(() => vi.advanceTimersByTimeAsync(2000));
    act(() => result.current.act.undo());
    const second = result.current.state.toast;
    expect(second!.id).toBeGreaterThan(first!.id);
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(result.current.state.toast).toEqual(second);
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(result.current.state.toast).toBeNull();
  });
});

describe('leaving while something is being saved', () => {
  it('asks the browser to confirm only while a save is still going', async () => {
    const local = localStudyRepository(null);
    let release = () => {};
    const slow: StudyRepository = {
      ...local,
      recordReview: async (input) => {
        await new Promise<void>((resolve) => (release = resolve));
        return local.recordReview(input);
      },
    };
    const { result } = mount(slow);
    await settle();
    const leaving = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(leaving()).toBe(false);
    act(() => result.current.act.reveal());
    act(() => result.current.act.answer(3));
    await settle();
    expect(leaving()).toBe(true);
    release();
    await act(() => result.current.saves.saved());
    await settle();
    expect(leaving()).toBe(false);
  });
});

describe('a save that fails', () => {
  it('stops the session: the failure is in the state and the answers stop', async () => {
    const local = localStudyRepository(null);
    const failing: StudyRepository = {
      ...local,
      recordReview: () => Promise.reject(new Error('No se pudo guardar tu respuesta: red')),
    };
    const { result } = mount(failing);
    await settle();
    act(() => result.current.act.reveal());
    act(() => result.current.act.answer(3));
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(result.current.state.failure).toEqual({
      kind: 'message',
      message: 'No se pudo guardar tu respuesta: red',
    });
    const shown = result.current.state.shown;
    act(() => result.current.act.reveal());
    act(() => result.current.act.answer(3));
    expect(result.current.state.shown).toEqual(shown);
  });
});

describe('an update that React sets aside under a synchronous one', () => {
  // A transition sits unrendered when a click comes in: React draws the click's update first and then replays both
  // in the order they were dispatched. What each pass asks to save has to keep the same ids, or it is saved twice.
  it('does not save the same write twice when it is replayed', async () => {
    const local = localStudyRepository(null);
    const calls = {
      recordReview: vi.spyOn(local, 'recordReview'),
      bury: vi.spyOn(local, 'bury'),
      undo: vi.spyOn(local, 'undo'),
    };
    let session: ReturnType<typeof useStudySession> | undefined;
    function Screen() {
      session = useStudySession(data(), DECK.id);
      return (
        <button type="button" onClick={() => session?.act.undo()}>
          undo
        </button>
      );
    }
    render(
      <StrictMode>
        <ApiClientContext value={fakeApi()}>
          <StudyRepositoryContext value={local}>
            <QueryClientProvider client={new QueryClient()}>
              <Screen />
            </QueryClientProvider>
          </StudyRepositoryContext>
        </ApiClientContext>
      </StrictMode>,
    );
    act(() => session?.act.open());
    act(() => session?.act.reveal());
    act(() => session?.act.answer(3));
    await settle();

    act(() => {
      startTransition(() => session?.act.hide('bury_card'));
      fireEvent.click(screen.getByRole('button', { name: 'undo' }));
    });
    await settle();
    await act(() => session!.saves.saved());

    expect(calls.undo).toHaveBeenCalledTimes(1);
    expect(calls.recordReview).toHaveBeenCalledTimes(1);
    expect(session?.state.failure).toBeNull();
  });
});

describe('whether «Listo por hoy» shows the summary of the day', () => {
  it('is decided when it opens, and not again while it stays open', () => {
    let answered = true;
    const ask = vi.fn(() => answered);
    const { result, rerender } = renderHook(({ done }) => useDoneSummary(done, ask), {
      initialProps: { done: true },
    });
    expect(result.current).toBe(true);
    answered = false;
    rerender({ done: true });
    expect(result.current).toBe(true);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('while studying there is none, and opening it again asks again', () => {
    let answered = true;
    const { result, rerender } = renderHook(({ done }) => useDoneSummary(done, () => answered), {
      initialProps: { done: true },
    });
    rerender({ done: false });
    expect(result.current).toBe(false);
    answered = false;
    rerender({ done: true });
    expect(result.current).toBe(false);
  });
});

describe('the number of the card in the session', () => {
  it('counts each card shown once, an undone one again, and nothing while none is shown', () => {
    const { result, rerender } = renderHook(({ key }) => useCardTurn(key), {
      initialProps: { key: '' },
    });
    expect(result.current).toBe(0);
    rerender({ key: 'a:0' });
    expect(result.current).toBe(1);
    rerender({ key: 'a:0' });
    expect(result.current).toBe(1);
    rerender({ key: 'b:0' });
    expect(result.current).toBe(2);
    rerender({ key: '' });
    expect(result.current).toBe(2);
    rerender({ key: 'a:0' });
    expect(result.current).toBe(3);
  });
});
