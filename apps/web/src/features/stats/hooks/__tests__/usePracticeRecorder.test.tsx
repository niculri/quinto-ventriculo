// Tests the practice recorder: retries and refusals.
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PRACTICE_DAY_MAX,
  PracticeRefusedError,
  localStudyRepository,
} from '../../../progress/api/repository';
import type { PracticeCount, StudyRepository } from '../../../progress/api/repository';
import { StudyRepositoryContext } from '../../../progress/api/context';
import { usePracticeRecorder } from '../usePracticeRecorder';

function recorder(recordPractice: (counts: PracticeCount[]) => Promise<void>, batch = 2) {
  const study = { recordPractice } as unknown as StudyRepository;
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StudyRepositoryContext value={study}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </StudyRepositoryContext>
  );
  const hook = renderHook(({ finished }) => usePracticeRecorder(finished, batch), {
    wrapper,
    initialProps: { finished: false },
  });
  // The round of the page ends: what waits goes.
  const flush = () => hook.rerender({ finished: true });
  return { ...hook, flush };
}

describe('sending practice', () => {
  it('a batch that fails for the network goes with the next one', async () => {
    const sent: PracticeCount[][] = [];
    let offline = true;
    const { result } = recorder(async (counts) => {
      sent.push(counts);
      if (offline) throw new Error('No se pudo guardar tu repaso: Failed to fetch');
    });
    act(() => {
      result.current.add('10');
      result.current.add('10');
    });
    await waitFor(() => expect(sent).toHaveLength(1));
    offline = false;
    act(() => result.current.add('11'));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]).toEqual([
      { deckId: '10', n: 2 },
      { deckId: '11', n: 1 },
    ]);
  });

  it('past 5,000 a day nothing more counts, and sending does not fail (the demo, as the database)', async () => {
    const study = localStudyRepository(null);
    for (let i = 0; i < 4; i++) await study.recordPractice([{ deckId: '10', n: 1000 }]);
    await study.recordPractice([{ deckId: '11', n: 998 }]);
    await study.recordPractice([
      { deckId: '10', n: 1 },
      { deckId: '11', n: 5 },
    ]);
    await expect(study.recordPractice([{ deckId: '10', n: 3 }])).resolves.toBeUndefined();
    const days = (await study.heatmap(null)).days;
    expect(days.map((d) => [d.deckId, d.practice])).toEqual([
      ['10', 4001],
      ['11', 999],
    ]);
    expect(days.reduce((t, d) => t + d.practice, 0)).toBe(PRACTICE_DAY_MAX);
  });

  it('one the database refuses is not sent again', async () => {
    const sent: PracticeCount[][] = [];
    const { result } = recorder(async (counts) => {
      sent.push(counts);
      if (sent.length === 1) throw new PracticeRefusedError('quota_exceeded');
    });
    act(() => {
      result.current.add('10');
      result.current.add('10');
    });
    await waitFor(() => expect(sent).toHaveLength(1));
    act(() => {
      result.current.add('11');
      result.current.add('11');
    });
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]).toEqual([{ deckId: '11', n: 2 }]);
  });
});

describe('what waits after a failure', () => {
  it('is never more than the answers one database batch takes: the rest is dropped', async () => {
    const sent: PracticeCount[][] = [];
    let offline = true;
    const { result, flush } = recorder(async (counts) => {
      sent.push(counts);
      if (offline) throw new Error('sin red');
    }, 1001);
    act(() => {
      for (let i = 0; i < 1000; i++) result.current.add('10');
      result.current.add('11');
    });
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent).toEqual([[{ deckId: '10', n: 1000 }], [{ deckId: '11', n: 1 }]]);
    offline = false;
    act(() => flush());
    await waitFor(() => expect(sent).toHaveLength(3));
    expect(sent[2]).toEqual([{ deckId: '10', n: 1000 }]);
  });

  it('is never more decks than one database batch takes', async () => {
    const sent: PracticeCount[][] = [];
    let offline = true;
    const { result, flush } = recorder(async (counts) => {
      sent.push(counts);
      if (offline) throw new Error('sin red');
    }, 101);
    act(() => {
      for (let d = 0; d < 101; d++) result.current.add(`d${d}`);
    });
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent.map((s) => s.length)).toEqual([100, 1]);
    offline = false;
    act(() => flush());
    await waitFor(() => expect(sent).toHaveLength(3));
    expect(sent[2]!.map((c) => c.deckId)).toEqual(Array.from({ length: 100 }, (_, d) => `d${d}`));
  });

  it('leaving the page in the middle of a round sends what waits', () => {
    const sent: PracticeCount[][] = [];
    const { result, unmount } = recorder(async (counts) => void sent.push(counts), 10);
    act(() => result.current.add('10'));
    expect(sent).toHaveLength(0);
    unmount();
    expect(sent).toEqual([[{ deckId: '10', n: 1 }]]);
  });
});

describe('when the answers go before a batch is full', () => {
  const visibility = (state: DocumentVisibilityState) =>
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  afterEach(() => visibility('visible'));

  it('a render that changes nothing sends nothing', () => {
    const sent: PracticeCount[][] = [];
    const { result, rerender } = recorder(async (counts) => void sent.push(counts), 10);
    act(() => result.current.add('10'));
    rerender({ finished: false });
    rerender({ finished: false });
    expect(sent).toHaveLength(0);
  });

  it('the round ending sends them, once', () => {
    const sent: PracticeCount[][] = [];
    const { result, flush, rerender } = recorder(async (counts) => void sent.push(counts), 10);
    act(() => result.current.add('10'));
    flush();
    rerender({ finished: true });
    expect(sent).toEqual([[{ deckId: '10', n: 1 }]]);
  });

  it('the page being hidden sends them, the page coming back does not', async () => {
    const sent: PracticeCount[][] = [];
    const { result } = recorder(async (counts) => void sent.push(counts), 10);
    act(() => result.current.add('10'));
    visibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(sent).toHaveLength(0);
    visibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(sent).toEqual([[{ deckId: '10', n: 1 }]]);
  });

  it('leaving the page sends them, and nothing is sent when nothing waits', () => {
    const sent: PracticeCount[][] = [];
    const { result, unmount } = recorder(async (counts) => void sent.push(counts), 10);
    act(() => result.current.add('10'));
    window.dispatchEvent(new Event('pagehide'));
    expect(sent).toEqual([[{ deckId: '10', n: 1 }]]);
    window.dispatchEvent(new Event('pagehide'));
    unmount();
    expect(sent).toHaveLength(1);
  });
});
