// Tests the cards of the URL's heatmap day: a malformed day is none, a past day reads its answers (from its start to the
// next day's) and the practice, a future day reads nothing, it waits while they come, and a retry asks again only for
// what failed.
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { dayStartsAt } from '@qv/srs';
import { dayNumber, isoOfDay, timingFor } from '@qv/study';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StudyRepositoryContext } from '../../../progress/api/context';
import { defaultPreferences } from '../../../progress/api/repository';
import type { StudyRepository } from '../../../progress/api/repository';
import type { CardsScope } from '../../../catalog/model/scope';
import type { CardsData } from '../../model/cardsData';
import { useDayCards } from '../useDayCards';

const PREFS = defaultPreferences();
const DATA = { cards: [], rows: [], prefs: PREFS } as unknown as CardsData;
const SCOPE = { node: { id: 's1' }, deckIds: ['d1'] } as unknown as CardsScope;
const PAST = '2026-01-05';

let study: { heatmap: ReturnType<typeof vi.fn>; ratedBetween: ReturnType<typeof vi.fn> };

function day(
  dayParam: string | null,
  op: { data?: CardsData | undefined; scope?: CardsScope | null } = {},
) {
  const data = 'data' in op ? op.data : DATA;
  const scope = op.scope === undefined ? SCOPE : op.scope;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StudyRepositoryContext value={study as unknown as StudyRepository}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </StudyRepositoryContext>
  );
  return renderHook(() => useDayCards(scope, data, dayParam), { wrapper });
}

beforeEach(() => {
  study = {
    heatmap: vi.fn().mockResolvedValue({ days: [{ day: dayNumber(PAST), deckId: 'd1', practice: 4 }] }),
    ratedBetween: vi.fn().mockResolvedValue([]),
  };
});

describe('the heatmap day', () => {
  it.each([null, '5-1-2026', '2026-01-5'])('is none for %s', (param) => {
    const { result } = day(param);
    expect(result.current).toMatchObject({ day: null, value: null, error: null, waiting: false });
    expect(study.ratedBetween).not.toHaveBeenCalled();
  });

  it('in the past reads its answers, from its start to the next day’s, and the practice of the scope', async () => {
    const { result } = day(PAST);
    expect(result.current.waiting).toBe(true);
    await waitFor(() => expect(result.current.value).not.toBeNull());
    const n = dayNumber(PAST);
    expect(study.ratedBetween).toHaveBeenCalledWith(
      new Date(dayStartsAt(n, PREFS.timeZone, PREFS.dayStartsAt) * 1000),
      new Date(dayStartsAt(n + 1, PREFS.timeZone, PREFS.dayStartsAt) * 1000),
    );
    expect(result.current.value).toMatchObject({ day: n, kind: 'answered', practice: 4 });
    expect(result.current.waiting).toBe(false);
  });

  it('in the past counts no practice without a scope, and reads the day under no scope', async () => {
    const { result } = day(PAST, { scope: null });
    await waitFor(() => expect(result.current.value).not.toBeNull());
    expect(result.current.value).toMatchObject({ kind: 'answered', practice: 0 });
  });

  it('today with practice in the scope is what was answered, as a past day', async () => {
    const today = timingFor(PREFS).today;
    study.heatmap.mockResolvedValue({ days: [{ day: today, deckId: 'd1', practice: 2 }] });
    const { result } = day(isoOfDay(today));
    await waitFor(() => expect(result.current.value).not.toBeNull());
    expect(result.current.value).toMatchObject({ day: today, kind: 'answered', practice: 2 });
  });

  it('today with nothing done is the cards due today', async () => {
    const today = timingFor(PREFS).today;
    const { result } = day(isoOfDay(today));
    await waitFor(() => expect(result.current.value).not.toBeNull());
    expect(result.current.value).toMatchObject({ day: today, kind: 'due' });
    expect(study.ratedBetween).toHaveBeenCalled();
  });

  it('in the future is the cards due then, and reads no answers', async () => {
    const { result } = day('2099-01-01');
    expect(result.current.value).toMatchObject({ kind: 'due', answers: 0 });
    await act(() => Promise.resolve());
    expect(study.heatmap).not.toHaveBeenCalled();
    expect(study.ratedBetween).not.toHaveBeenCalled();
  });

  it('waits for the data before it reads anything', async () => {
    const { result } = day(PAST, { data: undefined });
    await act(() => Promise.resolve());
    expect(result.current.waiting).toBe(true);
    expect(study.ratedBetween).not.toHaveBeenCalled();
  });
});

describe('a failure', () => {
  it('of the practice is the error, and only it is asked again on a retry', async () => {
    const failure = new Error('heat');
    study.heatmap.mockRejectedValueOnce(failure);
    const { result } = day(PAST);
    await waitFor(() => expect(result.current.error).toBe(failure));
    expect(result.current.waiting).toBe(false);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.value).not.toBeNull());
    expect(study.heatmap).toHaveBeenCalledTimes(2);
    expect(study.ratedBetween).toHaveBeenCalledTimes(1);
  });

  it('of the answers is the error, and only they are asked again on a retry', async () => {
    const failure = new Error('answers');
    study.ratedBetween.mockRejectedValueOnce(failure);
    const { result } = day(PAST);
    await waitFor(() => expect(result.current.error).toBe(failure));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.value).not.toBeNull());
    expect(study.ratedBetween).toHaveBeenCalledTimes(2);
    expect(study.heatmap).toHaveBeenCalledTimes(1);
  });
});
