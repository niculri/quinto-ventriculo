// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  LearningSteps,
  StudyQueue,
  answerButtonTime,
  answerButtonTimeCollapsible,
  answerCard,
  configFromAnki,
  dayStartsAt,
  defaultConfig,
  intersperse,
  leechThresholdMet,
  newCard,
  nextLearnMessage,
  parseConfig,
  schedTiming,
  schedulingStates,
  stepsToString,
  stringToSteps,
  timeSpan,
  utcOffset,
} from '../src';
import type { QueueCard, QueueDeck } from '../src';

const DAY = 86_400;

describe('timing (the day starts at the rollover hour, in the user’s zone)', () => {
  const tz = 'America/Santiago';
  it('as Anki computed it in the comparison runs', () => {
    // 2026-10-31 20:25 in Santiago (−03): the next day starts on 2026-11-01 at 4:00.
    expect(schedTiming(1793490330, tz, 4).nextDayAt).toBe(1793516400);
  });

  it('before the rollover hour it is still the previous day', () => {
    const at4 = 1793516400;
    const before = schedTiming(at4 - 60, tz, 4);
    const after = schedTiming(at4 + 60, tz, 4);
    expect(after.today).toBe(before.today + 1);
    expect(before.nextDayAt).toBe(at4);
    expect(after.nextDayAt).toBe(at4 + DAY);
  });

  it('another zone and another hour', () => {
    const t = schedTiming(Date.UTC(2026, 0, 15, 12, 0) / 1000, 'UTC', 0);
    expect(t.nextDayAt).toBe(Date.UTC(2026, 0, 16) / 1000);
    expect(t.today).toBe(Math.floor(Date.UTC(2026, 0, 15) / 1000 / DAY));
  });

  it('the start of a day, on both sides of a daylight-saving change', () => {
    // Santiago moves from −04 to −03 on 2026-09-06.
    expect(utcOffset(Date.UTC(2026, 6, 1) / 1000, tz)).toBe(-4 * 3600);
    expect(utcOffset(Date.UTC(2026, 9, 1) / 1000, tz)).toBe(-3 * 3600);
    for (const ms of [Date.UTC(2026, 8, 3, 12), Date.UTC(2026, 8, 10, 12)]) {
      const t = schedTiming(ms / 1000, tz, 4);
      expect(dayStartsAt(t.today + 1, tz, 4)).toBe(t.nextDayAt);
    }
    // The evening before the change Anki still counts the next rollover with the current offset (one
    // hour off); the day's own start is at 4:00 of the new offset.
    const eve = schedTiming(Date.UTC(2026, 8, 5, 23) / 1000, tz, 4);
    expect(dayStartsAt(eve.today + 1, tz, 4)).toBe(eve.nextDayAt - 3600);
  });
});

describe('steps (steps.rs tests)', () => {
  it.each([
    [[10], 1, 600, 900, null],
    [[1, 10], 2, 60, 330, 600],
    [[1, 10], 1, 60, 600, null],
    [[1, 10, 100], 3, 60, 330, 600],
    [[1, 10, 100], 2, 60, 600, 6000],
    [[1, 10, 100], 1, 60, 6000, null],
  ])('%j with %i left', (steps, remaining, again, hard, good) => {
    const s = new LearningSteps(steps);
    expect(s.againDelaySecsLearn()).toBe(again);
    expect(s.hardDelaySecs(remaining)).toBe(hard);
    expect(s.goodDelaySecs(remaining)).toBe(good);
  });

  it('a hard interval of a single step of 3 days is 4 days, not 4.5', () => {
    expect(new LearningSteps([3 * 1440]).hardDelaySecs(1)).toBe(4 * DAY);
  });

  it('are written and read as in Anki’s options', () => {
    expect(stepsToString([1, 10, 60, 1440, 0.5])).toBe('1m 10m 1h 1d 30s');
    expect(stringToSteps('1m 10m 1h 2d 30s x 15')).toEqual([1, 10, 60, 2880, 0.5, 15]);
  });
});

describe('leeches (review.rs tests)', () => {
  it('at the threshold and every half threshold after it', () => {
    const hits = (t: number) =>
      Array.from({ length: 12 }, (_, i) => i).filter((l) => leechThresholdMet(l, t));
    expect(hits(3)).toEqual([3, 5, 7, 9, 11]);
    expect(hits(8)).toEqual([8]);
    expect(hits(1)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(hits(0)).toEqual([]);
  });
});

describe('texts of the buttons and of the congratulations', () => {
  it('as Anki in Spanish', () => {
    expect(answerButtonTime(60)).toBe('1 m');
    expect(answerButtonTime(330)).toBe('6 m');
    expect(answerButtonTime(3600 * 1.5)).toBe('1,5 h');
    expect(answerButtonTime(4 * DAY)).toBe('4 d');
    expect(answerButtonTime(45 * DAY)).toBe('1,5 me');
    expect(answerButtonTime(800 * DAY)).toBe('2,2 añ');
    expect(answerButtonTimeCollapsible(60, 1200)).toBe('<1 m');
    expect(answerButtonTimeCollapsible(1200, 1200)).toBe('20 m');
    expect(answerButtonTimeCollapsible(0, 1200)).toBe('(fin)');
    expect(timeSpan(600)).toBe('10 minutos');
    expect(timeSpan(3600)).toBe('1 hora');
    expect(nextLearnMessage(300, 2)).toBe(
      'La próxima tarjeta estará lista en 5 minutos. Hay 2 tarjetas restantes en la cola de aprendizaje programadas para hoy más tarde.',
    );
    expect(nextLearnMessage(DAY, 0)).toBe('');
  });
});

describe('presets', () => {
  it('an Anki «schema 11» preset (as the .apkg brings it)', () => {
    const c = configFromAnki({
      new: { delays: [1, 10], perDay: 0, ints: [1, 4, 7], bury: true, initialFactor: 2500 },
      rev: { perDay: 100, maxIvl: 36500, bury: true, ease4: 1.3, ivlFct: 1 },
      lapse: { delays: [10], leechAction: 0, leechFails: 8, minInt: 1, mult: 0 },
      maxTaken: 60,
    });
    expect(c).toMatchObject({
      newPerDay: 0,
      reviewsPerDay: 100,
      buryNew: true,
      buryReviews: true,
      leechAction: 'suspend',
      desiredRetention: 0.9,
      fsrsParams: [],
      newCardGatherPriority: 'deck',
      newCardSortOrder: 'template',
    });
  });

  it('values out of range go back to the default, as in Anki', () => {
    const c = parseConfig({ newPerDay: -3, desiredRetention: 1.5, maximumReviewInterval: 0 });
    expect(c.newPerDay).toBe(DEFAULT_CONFIG.newPerDay);
    expect(c.desiredRetention).toBe(0.9);
    expect(c.maximumReviewInterval).toBe(36_500);
    expect(parseConfig({ fsrsParams: [1, 2, 3] }).fsrsParams).toEqual([]);
    expect(parseConfig(defaultConfig())).toEqual(defaultConfig());
  });
});

describe('answering', () => {
  const key = { noteGuid: 'n', ord: 0 };
  const timing = { now: 1_800_000_000, today: 20_000, nextDayAt: 1_800_000_000 + 30_000 };

  it('the fuzz depends only on the card and its reviews (the same after undoing)', () => {
    const card = { ...newCard(0), phase: 'review' as const, queue: 'review' as const };
    const review = {
      ...card,
      due: timing.today,
      interval: 30,
      stability: 30,
      difficulty: 5,
      reps: 6,
      lastReview: timing.now - 30 * DAY,
    };
    const a = answerCard(key, review, 3, defaultConfig(), timing);
    const b = answerCard(key, review, 3, defaultConfig(), timing);
    expect(a.card).toEqual(b.card);
    const other = answerCard({ noteGuid: 'm', ord: 0 }, review, 3, defaultConfig(), timing);
    expect(Math.abs(other.card.interval - a.card.interval)).toBeLessThan(10);
  });

  it('a learning step past the rollover becomes a day (interday learning)', () => {
    const config = { ...defaultConfig(), learnSteps: [1, 600] };
    const r = answerCard(key, newCard(0), 3, config, timing, { fuzz: false });
    expect(r.card.queue).toBe('dayLearn');
    expect(r.card.due).toBe(timing.today + 1);
    expect(r.log).toMatchObject({ rating: 3, interval: 1, lastInterval: 0, phaseBefore: 'new' });
  });

  it('a new card shows four next states and the learning steps on the buttons', () => {
    const states = schedulingStates(key, newCard(0), defaultConfig(), timing, { fuzz: false });
    expect(states.again).toMatchObject({ kind: 'learning', scheduledSecs: 60 });
    expect(states.good).toMatchObject({ kind: 'learning', scheduledSecs: 600 });
    expect(states.easy.kind).toBe('review');
  });
});

describe('queue', () => {
  const timing = { now: 1_800_000_000, today: 20_000, nextDayAt: 1_800_000_000 + 30_000 };
  const parent: QueueDeck = { id: '1', name: 'A', config: { ...defaultConfig(), newPerDay: 3 } };
  const extras: QueueDeck = {
    id: '2',
    name: 'A::Extras',
    config: { ...defaultConfig(), newPerDay: 0 },
  };
  const card = (guid: string, ord: number, deckId: string, index: number): QueueCard => ({
    noteGuid: guid,
    ord,
    deckId,
    index,
    record: null,
    hidden: false,
  });

  it('Extras with 0 new cards a day gives none; the parent’s limit counts its subdecks', () => {
    const q = StudyQueue.build({
      rootDeckId: '1',
      decks: [parent, extras],
      cards: [
        card('a', 0, '1', 0),
        card('a', 1, '1', 1),
        card('b', 0, '1', 2),
        card('c', 0, '1', 3),
        card('d', 0, '1', 4),
        card('x', 0, '2', 5),
      ],
      studiedToday: new Map([['1', { newCount: 1, reviewCount: 0 }]]),
      timing,
    });
    expect(q.counts()).toEqual({ new: 2, learning: 0, review: 0 });
    // Gathered by note (both cards of «a» share its position, as in Anki), then sorted by template.
    expect(q.entries().map((e) => `${e.noteGuid}${e.ord}`)).toEqual(['a0', 'a1']);
    const extrasOnly = StudyQueue.build({
      rootDeckId: '2',
      decks: [parent, extras],
      cards: [card('x', 0, '2', 0)],
      studiedToday: new Map(),
      timing,
    });
    expect(extrasOnly.next()).toBeNull();
  });

  it('cards never answered are gathered by note, then template (Anki’s «due asc, ord asc»)', () => {
    const q = StudyQueue.build({
      rootDeckId: '1',
      decks: [
        { ...parent, config: { ...parent.config, newPerDay: 3, newCardSortOrder: 'noSort' } },
      ],
      cards: [
        card('a', 0, '1', 0),
        card('a', 1, '1', 1),
        card('b', 0, '1', 2),
        card('b', 1, '1', 3),
      ],
      studiedToday: new Map(),
      timing,
    });
    expect(q.entries().map((e) => `${e.noteGuid}${e.ord}`)).toEqual(['a0', 'a1', 'b0']);
  });

  it('hidden cards (suspended or buried) are not gathered; siblings get buried', () => {
    const buried = { ...parent, config: { ...parent.config, buryNew: true } };
    const q = StudyQueue.build({
      rootDeckId: '1',
      decks: [buried],
      cards: [
        { ...card('a', 0, '1', 0), hidden: true },
        card('b', 0, '1', 1),
        card('b', 1, '1', 2),
      ],
      studiedToday: new Map(),
      timing,
    });
    expect(q.entries().map((e) => `${e.noteGuid}${e.ord}`)).toEqual(['b0']);
  });

  it('answer and undo: the card goes back to the top', () => {
    const q = StudyQueue.build({
      rootDeckId: '1',
      decks: [parent],
      cards: [card('a', 0, '1', 0), card('b', 0, '1', 1)],
      studiedToday: new Map(),
      timing,
    });
    const first = q.next()!;
    const result = answerCard(first, newCard(0), 3, parent.config, timing, { fuzz: false });
    const update = q.answered(first, result.card, timing);
    expect(q.next()?.noteGuid).toBe('b');
    expect(q.counts()).toEqual({ new: 1, learning: 1, review: 0 });
    q.undo(update);
    expect(q.next()?.noteGuid).toBe('a');
    expect(q.counts()).toEqual({ new: 2, learning: 0, review: 0 });
  });

  it('«added» orders and their reverse keep a note’s cards together, in template order', () => {
    const review = (guid: string, ord: number, index: number): QueueCard => ({
      ...card(guid, ord, '1', index),
      record: {
        phase: 'review',
        queue: 'review',
        due: timing.today,
        interval: 3,
        remainingSteps: 0,
        stability: 3,
        difficulty: 5,
        reps: 2,
        lapses: 0,
        lastReview: timing.now - 3 * 86_400,
      },
    });
    const cards = [review('a', 0, 0), review('a', 1, 1), review('b', 0, 2), review('b', 1, 3)];
    const order = (reviewOrder: 'added' | 'reverseAdded') =>
      StudyQueue.build({
        rootDeckId: '1',
        decks: [{ ...parent, config: { ...parent.config, reviewOrder } }],
        cards,
        studiedToday: new Map(),
        timing,
      })
        .entries()
        .map((e) => `${e.noteGuid}${e.ord}`);
    // Anki: «nid asc, ord asc» and «nid desc, ord asc».
    expect(order('added')).toEqual(['a0', 'a1', 'b0', 'b1']);
    expect(order('reverseAdded')).toEqual(['b0', 'b1', 'a0', 'a1']);
  });

  it('intersperse spreads the shorter list (intersperser.rs tests)', () => {
    expect(intersperse([1, 2, 3], [11, 22, 33])).toEqual([1, 11, 2, 22, 3, 33]);
    expect(intersperse([1, 2, 3], [11, 22])).toEqual([1, 11, 2, 22, 3]);
    expect(intersperse([1, 2, 3], [11, 22, 33, 44, 55, 66])).toEqual([
      11, 1, 22, 33, 2, 44, 55, 3, 66,
    ]);
    expect(intersperse([1, 2, 3], [11, 22, 33, 44, 55, 66, 77, 88])).toEqual([
      11, 22, 1, 33, 44, 2, 55, 66, 3, 77, 88,
    ]);
    expect(intersperse([1, 2, 3], [])).toEqual([1, 2, 3]);
  });
});

describe('new cards of the same note, when the day has to give its whole number', () => {
  // Two notes of three cards and one of a single card.
  const fresh = ['a', 'a', 'a', 'b', 'b', 'b', 'c'].map((noteGuid, index, all) => ({
    noteGuid,
    ord: all.slice(0, index).filter((n) => n === noteGuid).length,
    deckId: '1',
    index,
    record: null,
    hidden: false,
  }));
  const build = (newPerDay: number, fillNewWithSiblings: boolean) =>
    StudyQueue.build({
      rootDeckId: '1',
      decks: [
        {
          id: '1',
          name: 'D',
          config: { ...DEFAULT_CONFIG, newPerDay, buryNew: true, fillNewWithSiblings },
        },
      ],
      cards: fresh,
      studiedToday: new Map(),
      timing: schedTiming(1_700_000_000, 'UTC', 4),
    })
      .entries()
      .map((e) => `${e.noteGuid}${e.ord}`);

  it('without the option, as Anki: one card of each note', () => {
    expect(build(7, false)).toEqual(['a0', 'b0', 'c0']);
  });

  it('with it, the siblings fill up to the number, one of each note per round', () => {
    expect(build(7, true).toSorted()).toEqual(['a0', 'a1', 'a2', 'b0', 'b1', 'b2', 'c0']);
    expect(build(5, true).toSorted()).toEqual(['a0', 'a1', 'b0', 'b1', 'c0']);
  });

  it('with enough other notes, no sibling comes out', () => {
    expect(build(3, true).toSorted()).toEqual(['a0', 'b0', 'c0']);
  });
});
