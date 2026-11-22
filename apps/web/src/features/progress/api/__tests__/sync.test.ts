// Tests bringing the user's rows up to the content's card changes: the pages it walks, a content that started again,
// another tab ahead, and that a read waits for it once per user and tries again after a failure.
import type { CardChanges } from '@qv/schema';
import { describe, expect, it, vi } from 'vitest';
import { localStudyRepository } from '../repository';
import type { StudyRepository } from '../repository';
import { syncCards, withCardSync } from '../sync';

type Reconcile = StudyRepository['reconcileCards'];

function study(stored: number, reconcile: Reconcile): StudyRepository {
  return {
    ...localStudyRepository(null),
    cardsSyncedTo: async () => stored,
    reconcileCards: reconcile,
  };
}

const page = (over: Partial<CardChanges>): CardChanges => ({
  changes: [],
  next: 0,
  latest: 0,
  more: false,
  ...over,
});

describe('syncCards', () => {
  it('nothing new: no reconciling', async () => {
    const reconcile = vi.fn<Reconcile>();
    const n = await syncCards(
      { cardChanges: async (since) => page({ next: since, latest: since }) },
      study(7, reconcile),
    );
    expect(n).toBe(0);
    expect(reconcile).not.toHaveBeenCalled();
  });

  it('walks the pages while there are more, adding what changed', async () => {
    const asked: number[] = [];
    const reconcile = vi.fn<Reconcile>(async (input) => ({
      applied: true,
      syncedTo: input.upTo,
      changed: 2,
    }));
    const n = await syncCards(
      {
        cardChanges: async (since) => {
          asked.push(since);
          return page({ next: since + 10, latest: 30, more: since + 10 < 30 });
        },
      },
      study(0, reconcile),
    );
    expect(asked).toEqual([0, 10, 20]);
    expect(n).toBe(6);
  });

  it('a content that started again (behind what the user has) is read from the beginning', async () => {
    const asked: number[] = [];
    const reconcile = vi.fn<Reconcile>(async (input) => ({
      applied: true,
      syncedTo: input.upTo,
      changed: 1,
    }));
    await syncCards(
      {
        cardChanges: async (since) => {
          asked.push(since);
          return page({ next: 3, latest: 3 });
        },
      },
      study(50, reconcile),
    );
    expect(asked).toEqual([50, 0]);
    expect(reconcile).toHaveBeenCalledWith({ since: 50, upTo: 3, changes: [] });
  });

  it('another tab was ahead: goes on from where it left it', async () => {
    const reconcile = vi
      .fn<Reconcile>()
      .mockResolvedValueOnce({ applied: false, syncedTo: 20, changed: 0 })
      .mockResolvedValueOnce({ applied: true, syncedTo: 25, changed: 1 });
    const asked: number[] = [];
    await syncCards(
      {
        cardChanges: async (since) => {
          asked.push(since);
          return page({ next: since === 0 ? 10 : 25, latest: 25 });
        },
      },
      study(0, reconcile),
    );
    expect(asked).toEqual([0, 20]);
  });

  it('stops after fifty pages, so a content that never ends does not hang the page', async () => {
    const reconcile = vi.fn<Reconcile>(async (input) => ({
      applied: true,
      syncedTo: input.upTo,
      changed: 1,
    }));
    const n = await syncCards(
      { cardChanges: async (since) => page({ next: since + 1, latest: 10_000, more: true }) },
      study(0, reconcile),
    );
    expect(reconcile).toHaveBeenCalledTimes(50);
    expect(n).toBe(50);
  });
});

describe('withCardSync', () => {
  it('syncs once per user before the reads by deck, again for another user, and after a failure', async () => {
    let user: string | null = 'u1';
    const cardChanges = vi
      .fn<(since: number) => Promise<CardChanges>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementation(async (since) => page({ next: since, latest: since }));
    const synced = withCardSync(localStudyRepository(null), { cardChanges }, async () => user);
    await expect(synced.cards(['1'])).rejects.toThrow('offline');
    await synced.allCards();
    await synced.answeredDecks();
    expect(cardChanges).toHaveBeenCalledTimes(2);
    user = 'u2';
    await synced.deckProgress(new Date());
    expect(cardChanges).toHaveBeenCalledTimes(3);
    await synced.preferences();
    expect(cardChanges).toHaveBeenCalledTimes(3);
  });

  it('a sync of a user that failed after another user’s started does not undo the newer one', async () => {
    let user = 'u1';
    let failFirst: (e: Error) => void = () => undefined;
    const cardChanges = vi
      .fn<(since: number) => Promise<CardChanges>>()
      .mockImplementationOnce(() => new Promise((_, reject) => (failFirst = reject)))
      .mockImplementation(async (since) => page({ next: since, latest: since }));
    const synced = withCardSync(localStudyRepository(null), { cardChanges }, async () => user);
    const first = synced.cards(['1']);
    await vi.waitFor(() => expect(cardChanges).toHaveBeenCalledTimes(1));
    user = 'u2';
    await synced.cards(['1']);
    failFirst(new Error('offline'));
    await expect(first).rejects.toThrow('offline');
    await synced.cards(['1']);
    expect(cardChanges).toHaveBeenCalledTimes(2);
  });
});
