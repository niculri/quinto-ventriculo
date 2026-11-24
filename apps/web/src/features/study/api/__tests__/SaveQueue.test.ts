// Tests what a study session saves: answers when the connection fails, undo, and what an answer saves for statistics.

import { DEFAULT_PARAMETERS, retrievability } from '@qv/srs';
import { describe, expect, it, vi } from 'vitest';
import { CATALOG } from '../../../../test/fixtures/catalog';
import { DECK } from '../../../../test/fixtures/deck';
import {
  CardChangedError,
  ConnectionError,
  defaultPreferences,
  localStudyRepository,
} from '../../../progress/api/repository';
import type { ReviewInput, StoredCard, StudyRepository } from '../../../progress/api/repository';
import { blankRow, cardKey, EMPTY_PLAN, treeDecks } from '@qv/study';
import { StudyDriver } from '../../../../test/StudyDriver';
import { SaveQueue } from '../SaveQueue';
import type { SaveFailure } from '@qv/study';

const NETWORK = () => new ConnectionError('guardar tu respuesta');
const REFUSED = () => new Error('No se pudo guardar tu respuesta: internal error');

/** Long enough that only `retryNow` makes a waiting write go again. */
const NEVER = [3_600_000];

function session(
  repository: StudyRepository,
  rootId = DECK.id,
  rows: StoredCard[] = [],
  retryDelaysMs: readonly number[] = [0, 0],
) {
  return new StudyDriver(
    {
      deck: DECK,
      decks: treeDecks(CATALOG.anki.decks),
      authorPresets: DECK.presets,
      rows: new Map(rows.map((r) => [cardKey(r), r])),
      answers: [],
      prefs: { ...defaultPreferences('America/Santiago'), fullAnki: true },
      presets: [],
      settings: [],
      plan: { ...EMPTY_PLAN, activations: [{ deckId: '5', active: true }] },
    },
    rootId,
    repository,
    () => {},
    retryDelaysMs,
  );
}

function answer(s: StudyDriver, rating: 1 | 2 | 3 | 4 = 4) {
  s.reveal();
  s.answer(rating);
}

describe('saving the answers when the connection fails', () => {
  it('a failed connection is tried again, and the answer is saved once', async () => {
    const local = localStudyRepository(null);
    let fails = 1;
    const s = session({
      ...local,
      recordReview: (input) =>
        fails-- > 0 ? Promise.reject(NETWORK()) : local.recordReview(input),
    });
    s.showNext();
    answer(s);
    await s.saved();
    expect(s.failure).toBeNull();
    expect(s.pending).toBe(0);
    expect(await local.cards(['20', '21'])).toEqual([expect.objectContaining({ reps: 1 })]);
    expect(await local.answersSince(new Date(0))).toHaveLength(1);
  });

  it('if it was saved and only the reply was lost, the retry sees it and goes on', async () => {
    const local = localStudyRepository(null);
    let lose = 1;
    const s = session({
      ...local,
      recordReview: async (input) => {
        const saved = await local.recordReview(input);
        if (lose-- > 0) throw NETWORK();
        return saved;
      },
    });
    s.showNext();
    answer(s);
    answer(s);
    await s.saved();
    expect(s.failure).toBeNull();
    expect(await local.answersSince(new Date(0))).toHaveLength(2);
  });

  it('a refusal stops the session at once, and nothing after it is written', async () => {
    const local = localStudyRepository(null);
    let calls = 0;
    const s = session({
      ...local,
      recordReview: () => {
        calls++;
        return Promise.reject(REFUSED());
      },
    });
    s.showNext();
    answer(s);
    s.flag(2);
    s.hide('suspend_card');
    await s.saved();
    expect(calls).toBe(1);
    expect(s.failure).toBe('No se pudo guardar tu respuesta: internal error');
    expect([s.pending, s.unsaved]).toEqual([0, 0]);
    expect(await local.cards(['20', '21'])).toEqual([]);
  });

  it('without a connection the session goes on, and everything is saved in order once it is back', async () => {
    const local = localStudyRepository(null);
    let down = true;
    const s = session(
      {
        ...local,
        recordReview: (input) => (down ? Promise.reject(NETWORK()) : local.recordReview(input)),
      },
      DECK.id,
      [],
      NEVER,
    );
    s.showNext();
    answer(s);
    answer(s, 1);
    s.flag(2);
    await vi.waitFor(() => expect(s.unsaved).toBe(3));
    expect(s.failure).toBeNull();
    expect(await local.answersSince(new Date(0))).toEqual([]);
    down = false;
    s.retryNow();
    await s.saved();
    expect([s.failure, s.pending, s.unsaved]).toEqual([null, 0, 0]);
    expect(await local.answersSince(new Date(0))).toHaveLength(2);
    expect(await local.cards(['20', '21'])).toEqual(
      expect.arrayContaining([expect.objectContaining({ flag: 2 })]),
    );
    // Asked to hurry when nothing waits: nothing happens.
    s.retryNow();
    expect(s.pending).toBe(0);
  });

  it('each wait is longer than the one before, and the last one repeats', async () => {
    vi.useFakeTimers();
    try {
      const local = localStudyRepository(null);
      let calls = 0;
      const s = session(
        {
          ...local,
          recordReview: (input) =>
            ++calls < 5 ? Promise.reject(NETWORK()) : local.recordReview(input),
        },
        DECK.id,
        [],
        [10, 100],
      );
      s.showNext();
      answer(s);
      await vi.advanceTimersByTimeAsync(9);
      expect(calls).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(calls).toBe(2);
      await vi.advanceTimersByTimeAsync(100);
      expect(calls).toBe(3);
      await vi.advanceTimersByTimeAsync(99);
      expect(calls).toBe(3);
      await vi.advanceTimersByTimeAsync(101);
      await s.saved();
      expect([calls, s.failure, s.unsaved]).toEqual([5, null, 0]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('burying, suspending, flagging and reading the marks again are tried again too', async () => {
    const local = localStudyRepository(null);
    const once = <A extends unknown[], R>(call: (...args: A) => Promise<R>) => {
      let failed = false;
      return (...args: A): Promise<R> => {
        if (failed) return call(...args);
        failed = true;
        return Promise.reject(NETWORK());
      };
    };
    const s = session({
      ...local,
      bury: once(local.bury),
      suspend: once(local.suspend),
      setFlag: once(local.setFlag),
      cards: once(local.cards),
    });
    s.showNext();
    s.flag(3);
    s.hide('bury_card');
    s.hide('suspend_card');
    await s.saved();
    expect([s.failure, s.unsaved]).toEqual([null, 0]);
    const saved = await local.cards(['20', '21']);
    expect(saved).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ flag: 3, buriedUntil: expect.any(String) as string }),
        expect.objectContaining({ suspended: true }),
      ]),
    );
  });

  it('a flag, a burying or a suspending that was saved with its reply lost is not written twice', async () => {
    const local = localStudyRepository(null);
    const calls = { setFlag: 0, bury: 0, suspend: 0 };
    const lost = <A extends unknown[]>(
      name: keyof typeof calls,
      call: (...args: A) => Promise<void>,
    ) => {
      return async (...args: A): Promise<void> => {
        await call(...args);
        if (calls[name]++ === 0) throw NETWORK();
      };
    };
    const s = session({
      ...local,
      setFlag: lost('setFlag', local.setFlag),
      bury: lost('bury', local.bury),
      suspend: lost('suspend', local.suspend),
    });
    s.showNext();
    s.flag(3);
    s.undo();
    await s.saved();
    // Written twice, the undo would take back only the second one and leave the card flagged.
    expect(await local.cards(['20', '21'])).toEqual([]);
    s.hide('bury_card');
    s.hide('suspend_card');
    await s.saved();
    expect([s.failure, calls]).toEqual([null, { setFlag: 1, bury: 1, suspend: 1 }]);
  });

  it('the reading that tells whether a lost answer was saved is tried again as well', async () => {
    const local = localStudyRepository(null);
    let lose = 1;
    let reads = 0;
    const s = session({
      ...local,
      recordReview: async (input) => {
        const saved = await local.recordReview(input);
        if (lose-- > 0) throw NETWORK();
        return saved;
      },
      cards: (ids) => (reads++ === 0 ? Promise.reject(NETWORK()) : local.cards(ids)),
    });
    s.showNext();
    answer(s);
    await s.saved();
    expect(s.failure).toBeNull();
    expect(await local.answersSince(new Date(0))).toHaveLength(1);
  });

  it('a retry that finds the card changed by something else stops the session', async () => {
    const local = localStudyRepository(null);
    let calls = 0;
    const s = session({
      ...local,
      recordReview: async (input) => {
        calls++;
        if (calls === 1) throw NETWORK();
        // Another tab answered it meanwhile: the card is not as this answer left it.
        await local.recordReview({
          ...input,
          state: { ...input.state, reps: input.state.reps + 5 },
        });
        throw new CardChangedError();
      },
    });
    s.showNext();
    answer(s);
    await s.saved();
    expect(calls).toBe(2);
    expect(s.failure).toMatch(/cambió en otra pestaña/);
  });

  it('a card changed in another tab is not retried', async () => {
    const local = localStudyRepository(null);
    let calls = 0;
    const s = session({
      ...local,
      recordReview: () => {
        calls++;
        return Promise.reject(new CardChangedError());
      },
    });
    s.showNext();
    answer(s);
    await s.saved();
    expect(calls).toBe(1);
    expect(s.failure).toMatch(/cambió en otra pestaña/);
  });

  it('a card changed in another tab stops the session at once, even when it already holds this very answer', async () => {
    const local = localStudyRepository(null);
    let calls = 0;
    const s = session({
      ...local,
      recordReview: async (input) => {
        calls++;
        await local.recordReview(input);
        throw new CardChangedError();
      },
    });
    s.showNext();
    answer(s);
    await s.saved();
    expect(calls).toBe(1);
    expect(s.failure).toMatch(/cambió en otra pestaña/);
  });
});

describe('undo', () => {
  it('another tab acted after it: the database undoes nothing, the session says so and goes on', async () => {
    const local = localStudyRepository(null);
    const here = session(local);
    here.showNext();
    answer(here);
    await here.saved();
    const there = session(local);
    there.showNext();
    there.flag(1);
    await there.saved();
    const saved = await local.cards(['20', '21']);

    here.undo();
    await here.saved();
    expect(here.failure).toBeNull();
    expect(here.toast).toMatch(/No se deshizo: después estudiaste en otra pestaña/);
    expect(await local.cards(['20', '21'])).toEqual(saved);
  });

  it('says which answer it takes back, by the id the repository gave it', async () => {
    const local = localStudyRepository(null);
    const expected: unknown[] = [];
    const s = session({
      ...local,
      undo: (e) => {
        expected.push(e);
        return local.undo(e);
      },
    });
    s.showNext();
    answer(s);
    s.undo();
    await s.saved();
    const id: unknown = expect.any(String);
    expect(expected).toEqual([
      expect.objectContaining({ action: 'answer', actionId: id, deckId: '20' }),
    ]);
  });

  it('undoes the session’s own last action', async () => {
    const local = localStudyRepository(null);
    const s = session(local);
    s.showNext();
    answer(s);
    s.flag(3);
    s.undo();
    s.undo();
    await s.saved();
    expect(s.failure).toBeNull();
    expect(await local.cards(['20', '21'])).toEqual([]);
  });
  it('only what was done in this study session: what came before stays', async () => {
    const local = localStudyRepository(null);
    const first = session(local);
    first.showNext();
    answer(first);
    await first.saved();
    const before = await local.cards(['20', '21']);
    expect(before).toHaveLength(1);
    const next = session(local);
    next.showNext();
    expect(next.canUndo).toBe(false);
    next.undo();
    await next.saved();
    expect(next.failure).toBeNull();
    expect(next.toast).toBe('No hay nada que deshacer');
    expect(await local.cards(['20', '21'])).toEqual(before);
  });
});

describe('an undo whose reply was lost', () => {
  const lostOnce = (local: StudyRepository): StudyRepository => {
    let lose = true;
    return {
      ...local,
      undo: async (expected) => {
        const undone = await local.undo(expected);
        if (!lose) return undone;
        lose = false;
        throw new ConnectionError('deshacer');
      },
    };
  };

  it('of a new card’s answer: asked again, the card with no row is already undone', async () => {
    const local = localStudyRepository(null);
    const s = session(lostOnce(local));
    s.showNext();
    answer(s);
    s.undo();
    answer(s);
    await s.saved();
    expect([s.failure, s.toast]).toEqual([null, expect.stringMatching(/^Deshecho/)]);
    expect(await local.answersSince(new Date(0))).toHaveLength(1);
  });

  it('of a flag on a card with a row: back at its mark counts as undone, and the next answer is saved', async () => {
    const local = localStudyRepository(null);
    const s = session(lostOnce(local));
    s.showNext();
    answer(s, 1);
    await s.saved();
    const [before] = await local.cards(['20', '21']);
    s.showNext();
    s.flag(2);
    s.undo();
    await s.saved();
    expect([s.failure, s.toast]).toEqual([null, expect.stringMatching(/^Deshecho/)]);
    expect(await local.cards(['20', '21'])).toEqual([before]);
  });

  it('of the second of two flags in a row: the first one, which looks the same to the database, stays', async () => {
    const local = localStudyRepository(null);
    const s = session(lostOnce(local));
    s.showNext();
    s.flag(2);
    s.flag(3);
    s.undo();
    await s.saved();
    expect(s.failure).toBeNull();
    expect(await local.cards(['20', '21'])).toEqual([expect.objectContaining({ flag: 2 })]);
    s.flag(4);
    await s.saved();
    expect(s.failure).toBeNull();
  });

  it('but another tab acting meanwhile is a refusal: the card is not back at its mark', async () => {
    const local = localStudyRepository(null);
    let lose = true;
    const s = session({
      ...local,
      undo: async (expected) => {
        if (!lose) return local.undo(expected);
        lose = false;
        await local.setFlag({ noteGuid: expected!.noteGuid, ord: expected!.ord, deckId: '20' }, 5);
        throw new ConnectionError('deshacer');
      },
    });
    s.showNext();
    answer(s);
    s.undo();
    await s.saved();
    expect(s.failure).toBeNull();
    expect(s.toast).toMatch(/No se deshizo/);
    expect(await local.cards(['20', '21'])).toEqual([
      expect.objectContaining({ flag: 5, reps: 1 }),
    ]);
  });
});

it('an undo asked again of something this queue never wrote is refused, as the first time', async () => {
  let refused = 0;
  let lose = true;
  const local = localStudyRepository(null);
  const queue = new SaveQueue(
    {
      ...local,
      undo: (expected) => {
        if (!lose) return local.undo(expected);
        lose = false;
        return Promise.reject(new ConnectionError('deshacer'));
      },
    },
    new Map(),
    [0],
    () => {},
    () => {},
    () => refused++,
  );
  const card = { noteGuid: DECK.cards[0]!.noteGuid, ord: 0, deckId: '20' };
  queue.handle({ kind: 'undo', id: '1.2', undoes: '1.1', action: 'answer', card });
  await queue.saved();
  expect([refused, queue.failure, queue.waiting]).toEqual([1, null, false]);
});

it('an undo of something this queue never wrote is refused, without an id and without stopping', async () => {
  const failures: SaveFailure[] = [];
  let refused = 0;
  const local = localStudyRepository(null);
  const queue = new SaveQueue(
    local,
    new Map(),
    [0, 0],
    (f) => failures.push(f),
    () => {},
    () => refused++,
  );
  const card = { noteGuid: DECK.cards[0]!.noteGuid, ord: 0, deckId: '20' };
  queue.handle({ kind: 'undo', id: '1.2', undoes: '1.1', action: 'answer', card });
  await queue.saved();
  expect([failures, refused, queue.pending]).toEqual([[], 1, 0]);
});

it('an undo of another card of the same note is refused: the one that came before stays', async () => {
  const local = localStudyRepository(null);
  let refused = 0;
  const queue = new SaveQueue(
    local,
    new Map(),
    [0, 0],
    () => {},
    () => {},
    () => refused++,
  );
  const card = { noteGuid: DECK.cards[0]!.noteGuid, ord: 0, deckId: '20' };
  await local.setFlag(card, 2);
  queue.handle({
    kind: 'undo',
    id: '1.2',
    undoes: '1.1',
    action: 'flag',
    card: { ...card, ord: 1 },
  });
  await queue.saved();
  expect(refused).toBe(1);
  expect(await local.cards(['20', '21'])).toEqual([expect.objectContaining({ flag: 2 })]);
});

it('an undo the database takes for a command this queue did not write leaves the marks as they are', async () => {
  const local = localStudyRepository(null);
  const card = { noteGuid: DECK.cards[0]!.noteGuid, ord: 0, deckId: '20' };
  await local.setFlag(card, 2);
  const queue = new SaveQueue(
    local,
    new Map(),
    [0, 0],
    () => {},
    () => {},
    () => {},
  );
  queue.handle({ kind: 'undo', id: '1.2', undoes: '1.1', action: 'flag', card });
  await queue.saved();
  expect(queue.failure).toBeNull();
  expect(await local.cards(['20', '21'])).toEqual([]);
});

it('a failed undo for another reason stops the session', async () => {
  const failures: SaveFailure[] = [];
  const queue = new SaveQueue(
    { ...localStudyRepository(null), undo: () => Promise.reject(REFUSED()) },
    new Map(),
    [0, 0],
    (f) => failures.push(f),
    () => {},
    () => {},
  );
  const card = { noteGuid: DECK.cards[0]!.noteGuid, ord: 0, deckId: '20' };
  queue.handle({ kind: 'undo', id: '1.2', undoes: '1.1', action: 'answer', card });
  await queue.saved();
  expect(failures).toEqual([{ kind: 'message', message: REFUSED().message }]);
});

describe('the marks of the cards that were written', () => {
  it('a card flagged and then answered is saved: its mark is read again after the flag', async () => {
    const local = localStudyRepository(null);
    const s = session(local);
    s.showNext();
    s.flag(2);
    answer(s);
    await s.saved();
    expect(s.failure).toBeNull();
    expect(await local.cards(['20', '21'])).toEqual([
      expect.objectContaining({ flag: 2, reps: 1 }),
    ]);
  });
});

describe('what an answer saves for the statistics', () => {
  it('the recall FSRS predicted just before (none for a new card) and the card’s version', async () => {
    const DAY = 86_400_000;
    const now = Date.now();
    const basic = DECK.cards[0]!;
    const due: StoredCard = {
      ...blankRow(basic),
      phase: 'review',
      interday: true,
      due: new Date(now - DAY).toISOString(),
      interval: 4,
      stability: 10,
      difficulty: 5,
      reps: 3,
      lastReview: new Date(now - 5 * DAY).toISOString(),
      updatedAt: new Date(now - 5 * DAY).toISOString(),
    };
    const local = localStudyRepository(null);
    const saved: ReviewInput[] = [];
    const s = session(
      {
        ...local,
        recordReview: (input) => {
          saved.push(input);
          return local.recordReview(input);
        },
      },
      DECK.id,
      [due],
    );
    s.showNext();
    for (let i = 0; i < 3 && s.shown; i++) answer(s);
    await s.saved();
    const of = (c: { noteGuid: string; ord: number }) =>
      saved.find((x) => x.card.noteGuid === c.noteGuid && x.card.ord === c.ord);
    const expected = retrievability(DEFAULT_PARAMETERS, { stability: 10, difficulty: 5 }, 5);
    expect(of(basic)?.rBefore).toBeCloseTo(expected, 3);
    expect(of(basic)?.cardVersion).toBe(2);
    const fresh = saved.filter((x) => x !== of(basic));
    expect(fresh.length).toBeGreaterThan(0);
    for (const x of fresh) {
      expect(x.rBefore).toBeNull();
      expect(x.cardVersion).toBe(1);
    }
  });
});
