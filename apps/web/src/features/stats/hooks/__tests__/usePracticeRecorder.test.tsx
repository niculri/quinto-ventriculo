// Tests the practice recorder: retries and refusals.
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import {
  PRACTICE_DAY_MAX,
  PracticeRefusedError,
  localStudyRepository,
} from '../../../progress/api/repository';
import type { PracticeCount, StudyRepository } from '../../../progress/api/repository';
import { StudyRepositoryContext } from '../../../progress/api/context';
import { usePracticeRecorder } from '../usePracticeRecorder';

function recorder(recordPractice: (counts: PracticeCount[]) => Promise<void>) {
  const study = { recordPractice } as unknown as StudyRepository;
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StudyRepositoryContext value={study}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </StudyRepositoryContext>
  );
  return renderHook(() => usePracticeRecorder(2), { wrapper });
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
