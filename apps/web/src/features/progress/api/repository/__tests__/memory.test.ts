// Pins the rules the in-memory study repository re-implements from the users database's SQL functions, the few places
// where it accepts more than the database does, and what it makes of what a browser kept from before.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CardChangedError,
  localStudyRepository,
  PRACTICE_BATCH_DECKS,
  PRACTICE_BATCH_MAX,
  PRACTICE_DAY_MAX,
  PracticeRefusedError,
} from '../';
import type { CardRef, CardStateFields, ReviewInput, StudyRepository } from '../';
import { memoryStorage } from '../../../../../test/storage';

const NOW = Date.parse('2026-03-10T15:00:00Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const iso = (ms: number) => new Date(ms).toISOString();

const card = (noteGuid: string, ord = 0, deckId = 'd1'): CardRef => ({ noteGuid, ord, deckId });
const A = card('n1');
const A2 = card('n1', 1);
const B = card('n2');
const C = card('n3');

const reviewed = (over: Partial<CardStateFields> = {}): CardStateFields => ({
  phase: 'review',
  interday: true,
  remainingSteps: 0,
  due: iso(NOW + 2 * DAY),
  interval: 2,
  stability: 2.5,
  difficulty: 5,
  reps: 1,
  lapses: 0,
  lastReview: iso(NOW),
  suspended: false,
  leech: false,
  ...over,
});

const answer = (
  target: CardRef,
  expectedUpdatedAt: string | null,
  over: Partial<ReviewInput> = {},
): ReviewInput => ({
  card: target,
  expectedUpdatedAt,
  rating: 3,
  queueBefore: 'new',
  interval: 2,
  lastInterval: 0,
  durationMs: 4000,
  state: reviewed(),
  bury: [],
  buriedUntil: null,
  ...over,
});

let repo: StudyRepository;
const row = async (target: CardRef) =>
  (await repo.allCards()).find((c) => c.noteGuid === target.noteGuid && c.ord === target.ord);
const actions = async (target: CardRef) => (await repo.cardLog(target)).map((l) => l.action);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  repo = localStudyRepository(null, { timeZone: 'America/Santiago' });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('answers and «card_changed»', () => {
  it('an answer saves the card and its log row together', async () => {
    const { updatedAt } = await repo.recordReview(answer(A, null));
    expect(await row(A)).toMatchObject({ phase: 'review', reps: 1, deckId: 'd1', updatedAt });
    expect(await repo.cardLog(A)).toMatchObject([
      { action: 'answer', rating: 3, queueBefore: 'new', phaseBefore: 'new', phaseAfter: 'review' },
    ]);
    expect(await repo.ratedSince(new Date(NOW - HOUR))).toHaveLength(1);
  });

  it('a card changed since it was shown is not overwritten', async () => {
    const { updatedAt } = await repo.recordReview(answer(A, null));
    await expect(repo.recordReview(answer(A, null))).rejects.toBeInstanceOf(CardChangedError);
    await expect(repo.recordReview(answer(A, iso(NOW - DAY)))).rejects.toBeInstanceOf(
      CardChangedError,
    );
    await repo.recordReview(answer(A, updatedAt, { queueBefore: 'review' }));
    expect(await actions(A)).toEqual(['answer', 'answer']);
  });

  it('refuses an answer more than a day away from now; its log keeps the time it says', async () => {
    const late = answer(A, null, { state: reviewed({ lastReview: iso(NOW - 3 * DAY) }) });
    await expect(repo.recordReview(late)).rejects.toThrow('invalid_time');
    const at = iso(NOW - 3 * HOUR);
    await repo.recordReview(answer(A, null, { state: reviewed({ lastReview: at }) }));
    expect((await repo.cardLog(A))[0]).toMatchObject({ action: 'answer', reviewedAt: at });
  });

  it('an answer never clears «suspended» nor «leech»', async () => {
    await repo.suspend([A], false);
    await repo.recordReview(answer(A, (await row(A))!.updatedAt));
    expect(await row(A)).toMatchObject({ suspended: true });
    await repo.recordReview(answer(B, null, { state: reviewed({ leech: true }) }));
    await repo.recordReview(answer(B, (await row(B))!.updatedAt));
    expect(await row(B)).toMatchObject({ leech: true });
  });

  it('an answer buries the siblings it is told to, and undo takes back both', async () => {
    const until = iso(NOW + 12 * HOUR);
    await repo.recordReview(answer(A, null, { bury: [A2], buriedUntil: until }));
    expect(await row(A2)).toMatchObject({ phase: 'new', buriedUntil: until });
    expect(await actions(A2)).toEqual(['answer']);
    expect(await repo.undo()).toMatchObject({ action: 'answer', noteGuid: 'n1', ord: 0 });
    expect(await repo.allCards()).toEqual([]);
  });

  it('a suspended card is not buried, neither by an answer nor by «Enterrar»', async () => {
    const until = iso(NOW + 12 * HOUR);
    await repo.suspend([A2], false);
    await repo.bury([A2], new Date(until), false);
    await repo.recordReview(answer(A, null, { bury: [A2], buriedUntil: until }));
    expect(await row(A2)).toMatchObject({ suspended: true, buriedUntil: null });
    expect(await actions(A2)).toEqual(['suspend_card']);
  });

  it('suspending a buried card takes the burial away', async () => {
    await repo.bury([A], new Date(NOW + 12 * HOUR), true);
    expect(await actions(A)).toEqual(['bury_note']);
    await repo.suspend([A], true);
    expect(await row(A)).toMatchObject({ suspended: true, buriedUntil: null });
  });
});

describe('undo', () => {
  it('restores the card (and deletes it if it was new) and the log', async () => {
    const first = await repo.recordReview(answer(A, null));
    const before = await row(A);
    await repo.recordReview(
      answer(A, first.updatedAt, { rating: 1, state: reviewed({ phase: 'relearning' }) }),
    );
    expect(await repo.undo()).toMatchObject({ action: 'answer', rating: 1 });
    expect(await row(A)).toEqual({ ...before, retiredAt: null });
    expect(await repo.cardLog(A)).toHaveLength(1);
    await repo.undo();
    expect(await repo.allCards()).toEqual([]);
    expect(await repo.undo()).toBeNull();
  });

  it('«Olvidar» and a flag on several cards are undone whole, and do not count as answers', async () => {
    await repo.recordReview(answer(A, null));
    await repo.recordReview(answer(B, null));
    await repo.forget([A, B], false);
    expect((await repo.allCards()).map((c) => c.phase)).toEqual(['new', 'new']);
    await repo.undo();
    expect((await repo.allCards()).map((c) => c.phase)).toEqual(['review', 'review']);
    await repo.setFlags([A, B], 2);
    await repo.undo();
    expect((await repo.allCards()).map((c) => c.flag)).toEqual([0, 0]);
    expect(await repo.ratedSince(new Date(NOW - HOUR))).toHaveLength(2);
  });

  it('keeps the deck and the «taken out» mark that reconciling left', async () => {
    await repo.recordReview(answer(A, null));
    await repo.recordReview(answer(B, null));
    await repo.suspend([A, B], false);
    await repo.reconcileCards({
      since: 0,
      upTo: 1,
      changes: [
        { noteGuid: 'n1', ord: 0, deckId: 'd2' },
        { noteGuid: 'n2', ord: 0, deckId: null },
      ],
    });
    await repo.undo();
    expect(await row(A)).toMatchObject({ suspended: false, deckId: 'd2', retiredAt: null });
    expect(await row(B)).toMatchObject({ suspended: false, deckId: 'd1', retiredAt: iso(NOW) });
  });

  it('reaches an action of the last 48 hours, not older', async () => {
    await repo.recordReview(answer(A, null));
    vi.setSystemTime(NOW + 72 * HOUR);
    expect(await repo.undo()).toBeNull();
    expect(await repo.allCards()).toHaveLength(1);
  });
});

describe('the browser’s actions', () => {
  it('unsuspend, unbury and «Olvidar» touch only cards with a row, and only if they change', async () => {
    await repo.suspend([A], false);
    await repo.unbury([A]);
    await repo.unsuspend([B]);
    await repo.forget([C], true);
    expect(await repo.allCards()).toHaveLength(1);
    expect(await actions(A)).toEqual(['suspend_card']);
    expect(await repo.undo()).toMatchObject({ action: 'suspend_card' });
  });

  it('«Olvidar» makes the card new; the repetitions and lapses go only with resetCounts', async () => {
    await repo.recordReview(answer(A, null, { state: reviewed({ lapses: 2 }) }));
    await repo.forget([A], false);
    expect(await row(A)).toMatchObject({
      phase: 'new',
      due: null,
      stability: null,
      lastReview: null,
      reps: 1,
      lapses: 2,
    });
    await repo.forget([A], true);
    expect(await row(A)).toMatchObject({ reps: 0, lapses: 0 });
    expect(await actions(A)).toEqual(['answer', 'forget', 'forget']);
  });

  it('a flag on several cards leaves out the ones that already have it', async () => {
    await repo.setFlag(A, 1);
    await repo.setFlags([A, B], 1);
    expect(await actions(A)).toEqual(['flag']);
    expect(await actions(B)).toEqual(['flag']);
  });
});

describe('cards that moved or left (reconcile_cards)', () => {
  it('with another tab ahead, nothing is applied', async () => {
    await repo.recordReview(answer(A, null));
    const result = await repo.reconcileCards({
      since: 3,
      upTo: 4,
      changes: [{ noteGuid: 'n1', ord: 0, deckId: 'd2' }],
    });
    expect(result).toEqual({ applied: false, syncedTo: 0, changed: 0 });
    expect(await row(A)).toMatchObject({ deckId: 'd1' });
  });

  it('a moved row gets its deck and one taken out is marked; only real changes count', async () => {
    await repo.recordReview(answer(A, null));
    await repo.recordReview(answer(B, null));
    await repo.recordReview(answer(C, null));
    const result = await repo.reconcileCards({
      since: 0,
      upTo: 5,
      changes: [
        { noteGuid: 'n1', ord: 0, deckId: 'd2' },
        { noteGuid: 'n2', ord: 0, deckId: null },
        { noteGuid: 'n3', ord: 0, deckId: 'd1' },
        { noteGuid: 'n9', ord: 0, deckId: 'd3' },
      ],
    });
    expect(result).toEqual({ applied: true, syncedTo: 5, changed: 2 });
    expect(await repo.cardsSyncedTo()).toBe(5);
    expect(await row(A)).toMatchObject({ deckId: 'd2', retiredAt: null });
    expect(await row(B)).toMatchObject({ deckId: 'd1', retiredAt: iso(NOW) });
    expect(await row(C)).toMatchObject({ deckId: 'd1' });
    expect(await repo.allCards()).toHaveLength(3);
    await repo.reconcileCards({
      since: 5,
      upTo: 6,
      changes: [{ noteGuid: 'n2', ord: 0, deckId: 'd4' }],
    });
    expect(await row(B)).toMatchObject({ deckId: 'd4', retiredAt: null, phase: 'review' });
  });

  it('an answer from a page opened before the move keeps the row in its new deck', async () => {
    const { updatedAt } = await repo.recordReview(answer(A, null));
    await repo.reconcileCards({
      since: 0,
      upTo: 1,
      changes: [{ noteGuid: 'n1', ord: 0, deckId: 'd2' }],
    });
    await repo.recordReview(answer(A, updatedAt, { queueBefore: 'review' }));
    expect(await row(A)).toMatchObject({ deckId: 'd2', reps: 1 });
  });

  it('a card taken out leaves every count', async () => {
    await repo.recordReview(answer(A, null, { queueBefore: 'review' }));
    await repo.reconcileCards({
      since: 0,
      upTo: 1,
      changes: [{ noteGuid: 'n1', ord: 0, deckId: null }],
    });
    expect(await repo.deckProgress(new Date(NOW - 3 * HOUR))).toEqual([]);
    expect(await repo.answeredDecks()).toEqual([]);
    expect((await repo.homeCounts(['d1'], new Date(NOW + DAY), {})).decks).toEqual([]);
    expect((await repo.heatmap(null)).due).toEqual([]);
  });

  it('refuses more than 2,000 changes in a call', async () => {
    const changes = Array.from({ length: 2001 }, (_, i) => ({
      noteGuid: `x${i}`,
      ord: 0,
      deckId: 'd2',
    }));
    await expect(repo.reconcileCards({ since: 0, upTo: 1, changes })).rejects.toThrow('too_large');
    expect(
      await repo.reconcileCards({ since: 0, upTo: 1, changes: changes.slice(1) }),
    ).toMatchObject({
      applied: true,
    });
  });
});

describe('practice that does not change dates (record_practice)', () => {
  const practice = async () =>
    Object.fromEntries((await repo.heatmap(null)).days.map((d) => [d.deckId, d.practice]));

  it('adds to the day by deck, and touches neither the cards nor the log', async () => {
    await repo.recordPractice([
      { deckId: 'd1', n: 3 },
      { deckId: 'd2', n: 0 },
    ]);
    await repo.recordPractice([{ deckId: 'd1', n: 2 }]);
    expect(await practice()).toEqual({ d1: 5 });
    expect(await repo.allCards()).toEqual([]);
    expect(await repo.undo()).toBeNull();
  });

  it(`refuses a batch of more than ${PRACTICE_BATCH_DECKS} decks or ${PRACTICE_BATCH_MAX} answers`, async () => {
    const decks = (n: number) => Array.from({ length: n }, (_, i) => ({ deckId: `d${i}`, n: 1 }));
    await expect(repo.recordPractice(decks(PRACTICE_BATCH_DECKS + 1))).rejects.toBeInstanceOf(
      PracticeRefusedError,
    );
    await expect(
      repo.recordPractice([{ deckId: 'd1', n: PRACTICE_BATCH_MAX + 1 }]),
    ).rejects.toBeInstanceOf(PracticeRefusedError);
    await repo.recordPractice(decks(PRACTICE_BATCH_DECKS));
    await repo.recordPractice([{ deckId: 'd1', n: PRACTICE_BATCH_MAX - 1 }]);
    expect((await practice()).d1).toBe(PRACTICE_BATCH_MAX);
  });

  it(`counts at most ${PRACTICE_DAY_MAX} a day, in the order of the batch, and refuses nothing past it`, async () => {
    for (let sent = 0; sent < PRACTICE_DAY_MAX - 1; sent += PRACTICE_BATCH_MAX - 1) {
      await repo.recordPractice([
        { deckId: 'd1', n: Math.min(PRACTICE_BATCH_MAX - 1, PRACTICE_DAY_MAX - 1 - sent) },
      ]);
    }
    await repo.recordPractice([
      { deckId: 'd2', n: 1 },
      { deckId: 'd3', n: 5 },
    ]);
    await repo.recordPractice([{ deckId: 'd1', n: 7 }]);
    expect(await practice()).toEqual({ d1: PRACTICE_DAY_MAX - 1, d2: 1 });
  });
});

describe('presets', () => {
  it('one replacement for each preset of the author', async () => {
    const first = await repo.savePreset({ name: 'Mío', replaces: 'author-1', config: {} });
    await expect(
      repo.savePreset({ name: 'Otro', replaces: 'author-1', config: {} }),
    ).rejects.toThrow();
    await repo.savePreset({ id: first.id, name: 'Mío 2', replaces: 'author-1', config: {} });
    expect((await repo.presets()).map((p) => p.name)).toEqual(['Mío 2']);
  });

  it('deleting a preset takes it off the decks that used it', async () => {
    const mine = await repo.savePreset({ name: 'Mío', replaces: null, config: { new: 5 } });
    await repo.setDeckPreset('d1', { presetId: mine.id });
    await repo.setDeckPreset('d2', { authorPreset: 'author-1' });
    await repo.deletePreset(mine.id);
    expect(await repo.deckSettings()).toEqual([
      { deckId: 'd2', presetId: null, authorPreset: 'author-1' },
    ]);
  });
});

describe('what the web reads of the progress', () => {
  it('deck_progress: seen, new under «No mostrar más», late, and new today and yesterday', async () => {
    const dayStart = NOW - 3 * HOUR;
    const D = card('n4');
    await repo.recordReview(answer(A, null));
    await repo.recordReview(
      answer(B, null, {
        state: reviewed({ due: iso(NOW - 5 * DAY), lastReview: iso(NOW - 20 * HOUR) }),
      }),
    );
    await repo.suspend([C], false);
    await repo.recordReview(
      answer(D, null, {
        queueBefore: 'review',
        state: reviewed({ due: iso(NOW - 5 * DAY), lastReview: iso(NOW - 21 * HOUR) }),
      }),
    );
    await repo.bury([D], new Date(dayStart - HOUR), false);
    expect(await repo.deckProgress(new Date(dayStart))).toEqual([
      { deckId: 'd1', seen: 3, newSuspended: 1, overdue: 1, newToday: 1, newYesterday: 1 },
    ]);
  });

  it('answered_decks: a buried or flagged card does not count', async () => {
    await repo.recordReview(answer(A, null));
    await repo.bury([card('n5', 0, 'd2')], new Date(NOW + HOUR), false);
    await repo.setFlag(card('n6', 0, 'd3'), 3);
    expect(await repo.answeredDecks()).toEqual(['d1']);
  });

  it('median_answer_ms: null with fewer than 20 answers, then their median', async () => {
    for (let i = 0; i < 19; i++) {
      await repo.recordReview(answer(card(`m${i}`), null, { durationMs: i * 100 }));
    }
    expect(await repo.medianAnswerMs()).toBeNull();
    await repo.recordReview(answer(card('m19'), null, { durationMs: 1900 }));
    expect(await repo.medianAnswerMs()).toBe(950);
  });

  it('home_counts: seen, hidden, suspended, notes touched and what can come out before the end of the day', async () => {
    const until = new Date(NOW + 9 * HOUR);
    await repo.recordReview(answer(A, null));
    await repo.recordReview(
      answer(B, null, {
        state: reviewed({
          phase: 'learning',
          interday: false,
          remainingSteps: 1,
          due: iso(NOW + 10 * 60_000),
        }),
      }),
    );
    await repo.suspend([C], false);
    await repo.bury([A2], new Date(NOW + HOUR), false);
    const { decks, truncated } = await repo.homeCounts(['d1'], until, { d1: 0.2 });
    expect(truncated).toBe(false);
    expect(decks).toHaveLength(1);
    expect(decks[0]).toMatchObject({
      deckId: 'd1',
      seen: 2,
      hiddenNew: 2,
      suspended: 1,
      touched: 3,
      due: [{ noteGuid: 'n2', ord: 0, queue: 'l', due: Math.floor((NOW + 10 * 60_000) / 1000) }],
    });
    expect(decks[0]!.recall).toBeGreaterThan(1.9);
  });

  it('home_counts past 20,000 cards due is truncated, without decks', async () => {
    const due = 20_001;
    const cards = Array.from({ length: due }, (_, i) => ({
      ...card(`h${i}`),
      ...reviewed({ due: iso(NOW - DAY) }),
      flag: 0,
      buriedUntil: null,
      updatedAt: iso(NOW - DAY),
    }));
    const saved = new Map([['qv-demo-study', JSON.stringify({ cards })]]);
    const storage = {
      getItem: (k: string) => saved.get(k) ?? null,
      setItem: (k: string, v: string) => void saved.set(k, v),
    } as Storage;
    const big = localStudyRepository(storage, { timeZone: 'America/Santiago' });
    const counts = await big.homeCounts(['d1'], new Date(NOW + DAY), {});
    expect(counts.truncated).toBe(true);
    expect(counts.decks).toEqual([]);
  });
});

describe('more of what the web reads', () => {
  it('median_answer_ms rounds a half to the even number, as Postgres', async () => {
    for (let i = 0; i < 20; i++) {
      await repo.recordReview(answer(card(`m${i}`), null, { durationMs: i < 10 ? 1001 : 1002 }));
    }
    expect(await repo.medianAnswerMs()).toBe(1002);
  });

  it('the days of some decks leave out the cards of the others, and what is buried past today', async () => {
    await repo.recordReview(answer(A, null));
    await repo.recordReview(answer(card('x', 0, 'd2'), null));
    await repo.recordReview(answer(B, null));
    await repo.bury([B], new Date(NOW + 5 * DAY), false);
    const { due } = await repo.heatmap(['d1']);
    expect(due.map((d) => d.cards)).toEqual([1]);
    expect((await repo.heatmap(null)).due.map((d) => d.cards)).toEqual([2]);
  });

  it('a card due before today is not among the days to come', async () => {
    await repo.recordReview(answer(A, null, { state: reviewed({ due: iso(NOW - 2 * DAY) }) }));
    expect((await repo.heatmap(null)).due).toEqual([]);
  });

  it('practice of another day does not take room from today', async () => {
    await repo.recordPractice([{ deckId: 'd1', n: PRACTICE_BATCH_MAX - 1 }]);
    vi.setSystemTime(NOW + DAY);
    await repo.recordPractice([{ deckId: 'd1', n: 4 }]);
    const days = (await repo.heatmap(null)).days.map((d) => d.practice);
    expect(days).toEqual([PRACTICE_BATCH_MAX - 1, 4]);
  });

  it('a batch with nothing practised writes nothing', async () => {
    const storage = memoryStorage();
    const kept = localStudyRepository(storage);
    await kept.recordPractice([{ deckId: 'd1', n: 0 }]);
    expect(storage.length).toBe(0);
  });

  it('an answer that does not say when was given now', async () => {
    await repo.recordReview(answer(A, null, { state: reviewed({ lastReview: null }) }));
    expect((await repo.cardLog(A))[0]!.reviewedAt).toBe(iso(NOW));
  });

  it('a flag out of 0–7 is refused, also for several cards', async () => {
    await expect(repo.setFlags([A, B], 8)).rejects.toThrow(
      'No se pudo marcar las tarjetas: invalid_flag',
    );
    await expect(repo.setFlag(A, 1.5)).rejects.toThrow('invalid_flag');
    expect(await repo.allCards()).toEqual([]);
  });

  it('home_counts: decks and their cards due in order of id; a card without difficulty still counts its recall', async () => {
    const due = iso(NOW - HOUR);
    await repo.recordReview(answer(card('z', 0, 'd2'), null, { state: reviewed({ due }) }));
    await repo.recordReview(answer(card('b'), null, { state: reviewed({ due }) }));
    await repo.recordReview(answer(card('a', 1), null, { state: reviewed({ due }) }));
    await repo.recordReview(answer(card('a'), null, { state: reviewed({ due }) }));
    await repo.recordReview(
      answer(card('w', 0, 'd3'), null, { state: reviewed({ difficulty: null }) }),
    );
    await repo.recordReview(
      answer(card('u', 0, 'd4'), null, { state: reviewed({ difficulty: 5 }) }),
    );
    vi.setSystemTime(NOW + 3 * DAY);
    const { decks } = await repo.homeCounts(['d4', 'd2', 'd1', 'd3'], new Date(NOW), {});
    expect(decks.map((d) => d.deckId)).toEqual(['d1', 'd2', 'd3', 'd4']);
    expect(decks[0]!.due.map((c) => `${c.noteGuid}:${c.ord}`)).toEqual(['a:0', 'a:1', 'b:0']);
    expect(decks[2]!.recall).toBe(decks[3]!.recall);
    expect(decks[2]!.recall).toBeGreaterThan(0);
    expect(decks[2]!.recall).toBeLessThan(1);
  });
});

describe('what a browser kept', () => {
  const KEY = 'qv-demo-study';

  it('an empty storage is no progress; one that cannot be read is no progress either', async () => {
    const storage = memoryStorage();
    expect(await localStudyRepository(storage).preferences()).toBeNull();
    storage.setItem(KEY, '{not json');
    const broken = localStudyRepository(storage);
    expect(await broken.allCards()).toEqual([]);
    expect(await broken.preferences()).toBeNull();
  });

  it('a log from before the interval, the study day and the moment it was written is read by its time', async () => {
    const storage = memoryStorage();
    const kept = localStudyRepository(storage, { timeZone: 'America/Santiago' });
    await kept.recordReview(answer(A, null, { interval: 9, state: reviewed({ interval: 2 }) }));
    await kept.setFlag(A, 3);
    const data = JSON.parse(storage.getItem(KEY)!) as { log: Record<string, unknown>[] };
    for (const row of data.log) {
      delete row.interval;
      delete row.day;
      delete row.loggedAt;
    }
    storage.setItem(KEY, JSON.stringify(data));
    expect((await kept.cardLog(A)).map((l) => [l.action, l.interval])).toEqual([
      ['answer', 2],
      ['flag', null],
    ]);
    expect((await kept.heatmap(null)).days.map((d) => d.answers)).toEqual([1]);
    expect(await kept.undo()).toMatchObject({ action: 'flag' });
  });

  it('undo brings back a card that is no longer among the rows, as it was before', async () => {
    const storage = memoryStorage();
    const kept = localStudyRepository(storage);
    await kept.recordReview(answer(A, null));
    const before = (await kept.allCards())[0]!;
    await kept.setFlag(A, 2);
    const data = JSON.parse(storage.getItem(KEY)!) as { cards: unknown[] };
    data.cards = [];
    storage.setItem(KEY, JSON.stringify(data));
    await kept.undo();
    expect(await kept.allCards()).toEqual([before]);
  });

  it('undoing the first answer of a card no longer among the rows leaves nothing behind', async () => {
    const storage = memoryStorage();
    const kept = localStudyRepository(storage);
    await kept.recordReview(answer(A, null));
    const data = JSON.parse(storage.getItem(KEY)!) as { cards: unknown[] };
    data.cards = [];
    storage.setItem(KEY, JSON.stringify(data));
    expect(await kept.undo()).toMatchObject({ action: 'answer' });
    expect(await kept.allCards()).toEqual([]);
    expect(await kept.cardLog(A)).toEqual([]);
  });

  it('without crypto.randomUUID, the ids are still unique', async () => {
    vi.stubGlobal('crypto', {});
    try {
      const a = await repo.savePreset({ name: 'A', replaces: null, config: {} });
      const b = await repo.savePreset({ name: 'B', replaces: null, config: {} });
      expect(a.id).not.toBe(b.id);
      expect(a.id).toMatch(new RegExp(`^${NOW}-`));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('without a browser storage at all, the progress lives in memory', async () => {
    vi.stubGlobal('localStorage', undefined);
    try {
      const alone = localStudyRepository();
      await alone.recordReview(answer(A, null));
      expect(await alone.allCards()).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('a storage the browser refuses to give is no storage', async () => {
    const real = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('SecurityError');
      },
    });
    try {
      const alone = localStudyRepository();
      await alone.recordReview(answer(A, null));
      expect(await alone.allCards()).toHaveLength(1);
    } finally {
      Object.defineProperty(window, 'localStorage', real);
    }
  });
});
