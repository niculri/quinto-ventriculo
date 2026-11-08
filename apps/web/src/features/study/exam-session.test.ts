import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  answerCard,
  configFromAnki,
  dayStartsAt,
  newCard,
  schedTiming,
  schedulingStates,
} from '@qv/srs';
import type { CardRecord, QueueEntry, Rating } from '@qv/srs';
import type { CardSummary, DeckDetail } from '@qv/schema';
import { deckCounts } from './DeckCounts';
import { answerRound, isHard, revealCard, reviewPools, startRound } from './final-review';
import { masteryByDeck, masteryPercent } from './mastery';
import { REVIEW_AT_DAY, assessmentView, dateOfDay, dayOfDate } from './pace';
import { defaultPreferences, localStudyRepository } from './repository';
import type { CardRef, DeckProgress, StoredCard, StudyRepository } from './repository';
import { cardKey, configsFor, timingFor, treeDecks } from './scheduler';
import type { StudyData } from './scheduler';
import { StudySession, blankRow } from './session';
import { EMPTY_PLAN } from './simple';
import type { StudyPlan } from './simple';

const NOW = Date.parse('2026-11-01T15:00:00Z');
const DAY = 86_400_000;
const PREFS = { ...defaultPreferences('America/Santiago'), welcomeSeen: true };
const TODAY = timingFor(PREFS, NOW).today;

const COURSE = '3';
const ASSESSMENT = '4';
const L1 = '51';
const L1_EXTRAS = '61';
const L2 = '52';
const OTHER = '9';
const OTHER_L = '91';

/** Lecture 1 with 30 notes and 6 in its Extras, lecture 2 with 20, and another assessment. */
const SIZES: Record<string, number> = { [L1]: 30, [L1_EXTRAS]: 6, [L2]: 20, [OTHER_L]: 10 };

function tree() {
  const deck = (id: string, name: string, parentId: string | null, preset = 'Default') => ({
    id,
    name,
    parentId,
    preset,
    courseId: 'c',
    assessmentId: null,
    semester: 1,
    noteCount: 0,
    cardCount: 0,
  });
  const list = [
    deck('1', 'R', null),
    deck('2', 'R::S', '1'),
    deck(COURSE, 'R::S::C', '2'),
    deck(ASSESSMENT, 'R::S::C::A', COURSE),
    deck(L1, 'R::S::C::A::L1', ASSESSMENT),
    deck(L1_EXTRAS, 'R::S::C::A::L1::Extras', L1, 'Extras'),
    deck(L2, 'R::S::C::A::L2', ASSESSMENT),
    deck(OTHER, 'R::S::C::B', COURSE),
    deck(OTHER_L, 'R::S::C::B::L', OTHER),
  ];
  // As the catalog gives it: a deck's count with its subdecks'.
  for (const d of list) {
    d.cardCount = list
      .filter((x) => x.name === d.name || x.name.startsWith(`${d.name}::`))
      .reduce((t, x) => t + (SIZES[x.id] ?? 0), 0);
  }
  return list;
}

const card = (deckId: string, i: number): CardSummary => ({
  noteGuid: `${deckId}-${String(i).padStart(2, '0')}`,
  ord: 0,
  deckId,
  code: null,
  version: null,
  kind: 'basic',
  text: '',
});

const allCards = () =>
  Object.entries(SIZES).flatMap(([deckId, n]) =>
    Array.from({ length: n }, (_, i) => card(deckId, i)),
  );

const inDays = (n: number) => dateOfDay(TODAY + n);

/** The rows and today's answers give the same progress the database would. */
function progressOf(rows: StoredCard[], newToday: Record<string, number> = {}): DeckProgress[] {
  const ids = new Set([...rows.map((r) => r.deckId), ...Object.keys(newToday)]);
  return [...ids].map((deckId) => {
    const own = rows.filter((r) => r.deckId === deckId);
    return {
      deckId,
      seen: own.filter((r) => r.phase !== 'new').length,
      newSuspended: own.filter((r) => r.phase === 'new' && r.suspended).length,
      overdue: own.filter(
        (r) =>
          r.phase !== 'new' &&
          r.interday &&
          !r.suspended &&
          r.due !== null &&
          dayOfDate(r.due.slice(0, 10)) < TODAY,
      ).length,
      newToday: newToday[deckId] ?? 0,
      newYesterday: 0,
    };
  });
}

function study(
  plan: Partial<StudyPlan>,
  rows: StoredCard[] = [],
  over: Partial<StudyData> = {},
  root = COURSE,
): StudyData {
  const decks = treeDecks(tree());
  const inside = decks.filter(
    (d) => d.id === root || d.name.startsWith(`${decks.find((x) => x.id === root)!.name}::`),
  );
  const ids = new Set(inside.map((d) => d.id));
  const deck: DeckDetail = {
    id: root,
    name: 'x',
    fullName: decks.find((d) => d.id === root)!.name,
    description: '',
    courseId: 'c',
    assessmentId: null,
    preset: 'Default',
    noteCount: 0,
    cardCount: 0,
    subdecks: inside
      .filter((d) => d.id !== root)
      .map((d) => ({
        id: d.id,
        name: d.name,
        parentId: d.parentId,
        preset: d.authorPreset,
        cardCount: 0,
      })),
    cards: allCards().filter((c) => ids.has(c.deckId)),
    presets: [],
  };
  return {
    deck,
    decks,
    authorPresets: [
      { name: 'Default', config: { new: { perDay: 20, bury: true }, rev: { perDay: 200 } } },
      { name: 'Extras', config: { new: { perDay: 0 }, rev: { perDay: 200 } } },
    ],
    rows: new Map(rows.map((r) => [cardKey(r), r])),
    answers: [],
    prefs: PREFS,
    presets: [],
    settings: [],
    plan: { ...EMPTY_PLAN, ...plan },
    progress: progressOf(rows),
    ...over,
  };
}

const dated = (days: number, over: object = {}) => ({
  deckId: ASSESSMENT,
  includeExtras: false,
  newPerDay: 15,
  examDate: inDays(days),
  ...over,
});
const on = (...ids: string[]) => ids.map((deckId) => ({ deckId, active: true }));

function noSaving(): StudyRepository {
  return {
    ...localStudyRepository(null),
    recordReview: async () => ({ updatedAt: 'saved' }),
    bury: async () => {},
    suspend: async () => {},
    setFlag: async () => {},
    cards: async () => [],
  };
}

const review = (c: CardRef, over: Partial<StoredCard> = {}): StoredCard => ({
  ...blankRow(c),
  phase: 'review',
  interday: true,
  due: new Date(NOW + 5 * DAY).toISOString(),
  interval: 10,
  stability: 10,
  difficulty: 5,
  reps: 3,
  lastReview: new Date(NOW - 5 * DAY).toISOString(),
  updatedAt: new Date(NOW - 5 * DAY).toISOString(),
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('what the scheduler gets with a date', () => {
  // 30 cards on, 12 days left, 3 of review: 9 days, 4 a day.
  const plan = { activations: on(L1), assessments: [dated(12)] };

  it('the computed number, in every deck of the assessment', () => {
    const configs = configsFor(study(plan));
    expect(configs.get(ASSESSMENT)!.newPerDay).toBe(4);
    expect(configs.get(L1)!.newPerDay).toBe(4);
    expect(configs.get(L1_EXTRAS)!.newPerDay).toBe(4);
    // The other assessment keeps its own.
    expect(configs.get(OTHER)!.newPerDay).toBe(20);
  });

  it('counts the whole assessment even if the session opens on a lecture', () => {
    const data = study(plan, [], {}, L1);
    expect(deckCounts(data).get(L1)!.new).toBe(4);
    expect(configsFor(data).get(L1)!.newPerDay).toBe(4);
  });

  it('«N para hoy» is what comes out when studying', () => {
    const data = study(plan);
    const said = deckCounts(data).get(ASSESSMENT)!;
    expect(said.new).toBe(4);
    const session = new StudySession(study(plan, [], {}, ASSESSMENT), ASSESSMENT, noSaving());
    session.showNext();
    const first = new Set<string>();
    for (let i = 0; i < 100 && session.shown; i++) {
      first.add(cardKey(session.shown.entry));
      session.reveal();
      session.answer(3);
    }
    expect(session.shown).toBeNull();
    expect(first.size).toBe(said.new);
  });

  it.each([
    ['the course', COURSE],
    ['the assessment', ASSESSMENT],
    ['a lecture', L1],
  ])('from %s, «N para hoy» is what comes out, with notes of several cards too', (_, root) => {
    // Lecture 1 with 6 notes of a card and 3 of eight; lecture 2 on, with notes of a card.
    const many = { activations: on(L1, L2), assessments: [dated(30)] };
    const withNotes = () => {
      const data = study(many, [], {}, root);
      let i = 0;
      data.deck.cards = data.deck.cards.map((c) => {
        if (c.deckId !== L1) return c;
        const at = i++;
        return at < 6
          ? c
          : { ...c, noteGuid: `big-${Math.floor((at - 6) / 8)}`, ord: (at - 6) % 8 };
      });
      return data;
    };
    const said = deckCounts(withNotes()).get(root)!;
    const session = new StudySession(withNotes(), root, noSaving());
    session.showNext();
    const out = new Set<string>();
    for (let i = 0; i < 100 && session.shown; i++) {
      if (session.shown.entry.kind === 'new') out.add(cardKey(session.shown.entry));
      session.reveal();
      session.answer(3);
    }
    expect(session.shown).toBeNull();
    expect(out.size).toBe(said.new);
    // 50 cards over 27 days: 2 a day, the same wherever one studies from.
    expect(said.new).toBe(2);
  });

  it('does not change during the day, and what was studied counts', () => {
    // Three answered: the page reads them from the database and the number stays.
    const answered = [0, 1, 2].map((i) => ({
      ...review(card(L1, i)),
      phase: 'learning' as const,
      interday: false,
    }));
    const data = study(plan, answered, {
      answers: answered.map((r) => ({ deckId: r.deckId, queueBefore: 'new' as const })),
      progress: progressOf(answered, { [L1]: 3 }),
    });
    expect(configsFor(data).get(L1)!.newPerDay).toBe(4);
    expect(deckCounts(data).get(ASSESSMENT)!.new).toBe(1);
  });

  it('in a session, with something skipped or hidden on the way, the number is the same', () => {
    const session = new StudySession(study(plan, [], {}, ASSESSMENT), ASSESSMENT, noSaving());
    session.showNext();
    session.reveal();
    session.answer(3);
    expect(session.counts().new).toBe(3);
    // A hidden card rebuilds the queue: the limit is still 4, with one studied.
    session.hide('suspend_card');
    expect(session.counts().new).toBe(3);
  });

  it('turning on a lecture recalculates it', () => {
    const more = { ...plan, activations: on(L1, L2) };
    // 50 / 9.
    expect(configsFor(study(more)).get(L1)!.newPerDay).toBe(6);
  });

  it('Extras count only if they are included', () => {
    const extras = { activations: on(L1), assessments: [dated(12, { includeExtras: true })] };
    // 36 / 9.
    expect(configsFor(study(extras)).get(L1)!.newPerDay).toBe(4);
    expect(deckCounts(study(extras)).get(L1_EXTRAS)).toBeDefined();
    const big = { activations: on(L1), assessments: [dated(4, { includeExtras: true })] };
    expect(configsFor(study(big)).get(L1_EXTRAS)!.newPerDay).toBe(36);
    expect(configsFor(study({ ...big, assessments: [dated(4)] })).get(L1)!.newPerDay).toBe(30);
  });

  it('the days of the final review give no new cards, but what is due still comes out', () => {
    const rows = [review(card(L1, 0), { due: new Date(NOW - 2 * DAY).toISOString() })];
    const data = study({ activations: on(L1), assessments: [dated(2)] }, rows);
    expect(deckCounts(data).get(ASSESSMENT)).toMatchObject({ new: 0, review: 1 });
  });

  it('a date that passed goes back to the student’s number', () => {
    const data = study({ activations: on(L1), assessments: [dated(-1)] });
    expect(configsFor(data).get(L1)!.newPerDay).toBe(15);
    expect(deckCounts(data).get(ASSESSMENT)!.new).toBe(15);
  });

  it('without a date, as it was', () => {
    const data = study({
      activations: on(L1),
      assessments: [{ deckId: ASSESSMENT, includeExtras: false, newPerDay: 7 }],
    });
    expect(configsFor(data).get(L1)!.newPerDay).toBe(7);
  });

  it('«Modo avanzado»: a date decides there too, and without one the presets do', () => {
    const full = { prefs: { ...PREFS, fullAnki: true } };
    const dated = configsFor(study(plan, [], full));
    const simple = configsFor(study(plan));
    expect(dated.get(L1)!.newPerDay).toBe(simple.get(L1)!.newPerDay);
    expect(dated.get(L1)!.fillNewWithSiblings).toBe(true);
    const without = configsFor(study({ activations: on(L1) }, [], full));
    expect(without.get(L1)!.newPerDay).toBe(20);
    expect(without.get(L1_EXTRAS)!.newPerDay).toBe(20);
    expect(without.get(L1)!.fillNewWithSiblings).toBe(false);
  });

  it('a new day with the session open: it is computed again, from what is left', () => {
    const session = new StudySession(study(plan, [], {}, ASSESSMENT), ASSESSMENT, noSaving());
    session.showNext();
    for (let i = 0; i < 4; i++) {
      session.reveal();
      session.answer(3);
    }
    vi.setSystemTime(NOW + DAY);
    session.showNext();
    // 26 left over 8 days: 4 again, and the four of yesterday are not new any more.
    const counts = session.counts();
    expect(counts.new).toBe(4);
  });
});

describe('the screen at the end of the day', () => {
  const plan = { activations: on(L1), assessments: [dated(12)] };

  const finish = (data: StudyData, root: string) => {
    const session = new StudySession(data, root, noSaving());
    session.showNext();
    for (let i = 0; i < 200 && session.shown; i++) {
      session.reveal();
      session.answer(3);
    }
    return session;
  };

  it('says the number is computed, and there is a review to do', () => {
    const session = finish(study(plan, [], {}, L1), L1);
    expect(session.congrats().exam).toMatchObject({ computed: true, catchUp: null, roseTo: null });
    expect(session.hasSeen(ASSESSMENT)).toBe(true);
    expect(session.hasSeen(OTHER)).toBe(false);
  });

  it('the days of the final review', () => {
    const session = finish(study({ activations: on(L1), assessments: [dated(1)] }, [], {}, L1), L1);
    expect(session.congrats()).toMatchObject({
      newLimitReached: true,
      exam: { finalReview: true, computed: false },
    });
  });

  it('a backlog in another lecture is still there; the one of this session, no', () => {
    const late = (deckId: string, i: number) =>
      review(card(deckId, i), {
        due: new Date(NOW - 3 * DAY).toISOString(),
        lastReview: new Date(NOW - 9 * DAY).toISOString(),
      });
    const rows = [
      ...Array.from({ length: 20 }, (_, i) => late(L1, i)),
      ...Array.from({ length: 20 }, (_, i) => late(L2, i)),
    ];
    const session = finish(study(plan, rows, {}, L1), L1);
    // Only 20 are left, those of the other lecture: not large.
    expect(session.congrats().exam!.catchUp).toBeNull();

    const progress = progressOf(rows).map((p) => (p.deckId === L2 ? { ...p, overdue: 300 } : p));
    const behind = finish(study(plan, rows, { progress }, L1), L1);
    expect(behind.congrats().exam!.catchUp).toEqual({ overdue: 300, perDay: 60, days: 5 });
  });

  it('whoever left new cards undone is told the new number', () => {
    const data = study(
      {
        activations: on(L1),
        assessments: [dated(12, { examDateSetAt: new Date(NOW - 9 * DAY).toISOString() })],
      },
      [],
      {},
      L1,
    );
    // 30 / 9 is 4; yesterday it would have been 30 / 10 = 3.
    expect(finish(data, L1).congrats().exam!.roseTo).toBe(4);
  });

  it('the last day with new cards does not promise more for tomorrow', () => {
    // 4 days left, 3 of final review: today is the last.
    const last = study({ activations: on(L1), assessments: [dated(4)] }, [], {}, L1);
    expect(finish(last, L1).congrats().exam).toMatchObject({ computed: true, lastNewDay: true });
    const before = study({ activations: on(L1), assessments: [dated(5)] }, [], {}, L1);
    expect(finish(before, L1).congrats().exam).toMatchObject({ computed: true, lastNewDay: false });
  });

  it('above an assessment, nothing to say about one of them', () => {
    expect(finish(study(plan), COURSE).congrats().exam).toBeNull();
  });
});

describe('a student who answers everything, day after day, with the real scheduler', () => {
  // 6 notes of a card and 3 of eight: with burying alone a note gives about one card every 2 days, and they would not fit.
  for (const finalReviewDays of [1, 3, 7]) {
    it(`sees everything before the ${finalReviewDays} days left for reviewing, and «N para hoy» is what comes out`, async () => {
      const remap = (c: CardSummary, i: number) =>
        i < 6 ? c : { ...c, noteGuid: `big-${Math.floor((i - 6) / 8)}`, ord: (i - 6) % 8 };
      const plan = {
        activations: on(L1),
        assessments: [dated(14, { finalReviewDays, examDateSetAt: new Date(NOW).toISOString() })],
      };
      const repository = localStudyRepository(null, PREFS);
      for (let day = 0; day <= 14; day++) {
        let now = NOW + day * DAY;
        vi.setSystemTime(now);
        const today = timingFor(PREFS, now).today;
        const dayStart = new Date(dayStartsAt(today, PREFS.timeZone, PREFS.dayStartsAt) * 1000);
        const progress = await repository.deckProgress(dayStart);
        const data = study(plan, await repository.cards([L1, L1_EXTRAS, L2]), { progress });
        data.deck.cards = data.deck.cards
          .filter((c) => c.deckId === L1)
          .map(remap)
          .concat(data.deck.cards.filter((c) => c.deckId !== L1));
        const session = new StudySession(data, ASSESSMENT, repository);
        session.showNext();
        const said = session.counts().new;
        const view = assessmentView({
          decks: data.decks,
          plan: data.plan,
          progress,
          assessmentId: ASSESSMENT,
          today,
          prefs: PREFS,
        });
        expect(view.rose, `day ${day}`).toBe(false);
        // The whole number of the day comes out.
        expect(said, `day ${day}`).toBe(view.pace.kind === 'computed' ? view.pace.newPerDay : 0);
        if (view.pace.kind === 'computed') expect(said).toBeGreaterThan(0);
        let shown = 0;
        for (let i = 0; i < 400 && session.shown; i++) {
          if (session.shown.entry.kind === 'new') shown++;
          session.reveal();
          session.answer(3);
          now += 8000;
          vi.setSystemTime(now);
        }
        await session.saved();
        expect(shown, `day ${day}`).toBe(said);
        // From the first day for reviewing on, nothing new is left.
        const seen = (await repository.cards([L1])).filter((r) => r.phase !== 'new').length;
        if (day === 14 - finalReviewDays - 1) expect(seen).toBe(30);
      }
    });
  }

  it('without a date, the cards of a note stay apart', async () => {
    const plan = { activations: on(L1), assessments: [] };
    const data = study(plan, []);
    data.deck.cards = data.deck.cards.map((c, i) => ({
      ...c,
      noteGuid: `big-${Math.floor(i / 8)}`,
      ord: i % 8,
    }));
    const session = new StudySession(data, ASSESSMENT, localStudyRepository(null, PREFS));
    session.showNext();
    const notes = new Set<string>();
    for (let i = 0; i < 300 && session.shown; i++) {
      if (session.shown.entry.kind === 'new') {
        expect(notes.has(session.shown.entry.noteGuid)).toBe(false);
        notes.add(session.shown.entry.noteGuid);
      }
      session.reveal();
      session.answer(3);
    }
    await session.saved();
    expect(notes.size).toBeGreaterThan(0);
  });

  it('the demo counts what is late as the database does', async () => {
    const repository = localStudyRepository(null, PREFS);
    const late = (i: number) => {
      const c = card(L1, i);
      return repository.recordReview({
        card: c,
        expectedUpdatedAt: null,
        rating: 3,
        queueBefore: 'review',
        interval: 2,
        lastInterval: 2,
        durationMs: 4000,
        state: { ...review(c), due: new Date(NOW - 3 * DAY).toISOString() },
        bury: [],
        buriedUntil: null,
      });
    };
    await late(0);
    await late(1);
    await late(2);
    const dayStart = new Date(NOW - 3_600_000);
    const overdue = async () => (await repository.deckProgress(dayStart))[0]!.overdue;
    expect(await overdue()).toBe(3);
    await repository.bury([card(L1, 0)], dayStart, false);
    expect(await overdue()).toBe(2);
    await repository.bury([card(L1, 1)], new Date(dayStart.getTime() - DAY), false);
    expect(await overdue()).toBe(2);
    await repository.bury([card(L1, 2)], new Date(NOW + DAY), false);
    expect(await overdue()).toBe(1);
  });
});

/** The scheduler itself, with the author's options: a card answered with these buttons, a day at a time. */
function answered(ratings: Rating[]) {
  const config = configFromAnki({ new: { perDay: 20, bury: true, delays: [1, 10] }, rev: {} });
  const key = { noteGuid: 'a', ord: 0, deckId: L1 };
  let card: CardRecord = newCard(0);
  let t = NOW / 1000;
  const stops: { day: number; card: CardRecord }[] = [];
  for (const rating of ratings) {
    const timing = schedTiming(t, 'America/Santiago', 4);
    const kind =
      card.queue === 'new' ? ('new' as const) : card.queue === 'review' ? 'review' : 'learning';
    const entry = { ...key, kind } as QueueEntry;
    const states = schedulingStates(entry, card, config, timing);
    card = answerCard(key, card, rating, config, timing, {}, states).card;
    t += card.queue === 'review' ? card.interval * 86_400 : 600;
    stops.push({ day: Math.round((t - NOW / 1000) / 86_400), card });
  }
  return stops;
}

describe('what is said about a card is what the scheduler does', () => {
  it('the days a card comes back, for the time the plan takes', () => {
    const days = answered([3, 3, 3, 3, 3, 3])
      .filter((s) => s.card.queue === 'review')
      .map((s) => s.day);
    expect(days.slice(0, REVIEW_AT_DAY.length)).toEqual(REVIEW_AT_DAY);
  });

  it('«difícil» is failing a card twice, not once', () => {
    const c = card(L1, 0);
    const after = (ratings: Rating[]) => {
      const { difficulty, lapses } = answered(ratings).at(-1)!.card;
      return isHard(review(c, { difficulty: difficulty!, lapses }));
    };
    // Going well, and a card failed once: once on its first day or once after learning it.
    expect(after([3, 3, 3])).toBe(false);
    expect(after([1, 3, 3])).toBe(false);
    expect(after([3, 3, 1, 3])).toBe(false);
    // Twice.
    expect(after([1, 1, 3, 3])).toBe(true);
    expect(after([3, 3, 1, 3, 1, 3])).toBe(true);
    expect(after([1, 3, 3, 1, 3])).toBe(true);
  });
});

describe('dominio', () => {
  const plan = { activations: on(L1) };

  it('with nothing seen, 0', () => {
    const m = masteryByDeck(study(plan));
    expect(m.get(L1)).toBe(0);
    expect(m.get(ASSESSMENT)).toBe(0);
    expect(masteryPercent(0)).toBe(0);
  });

  it('the average over every card, with the ones not seen as 0', () => {
    // 15 of the 30 cards, just reviewed.
    const rows = Array.from({ length: 15 }, (_, i) =>
      review(card(L1, i), { lastReview: new Date(NOW).toISOString() }),
    );
    const m = masteryByDeck(study(plan, rows));
    expect(m.get(L1)).toBeCloseTo(0.5, 5);
    // The assessment has lecture 2 as well: 15 of 50. Extras do not count.
    expect(m.get(ASSESSMENT)).toBeCloseTo(0.3, 5);
    expect(masteryPercent(m.get(L1)!)).toBe(50);
  });

  it('it goes up by moving forward and down with time', () => {
    const rows = (n: number) => Array.from({ length: n }, (_, i) => review(card(L1, i)));
    const few = masteryByDeck(study(plan, rows(10))).get(L1)!;
    const more = masteryByDeck(study(plan, rows(20))).get(L1)!;
    expect(more).toBeGreaterThan(few);
    const data = study(plan, rows(20));
    const later = masteryByDeck(data, NOW + 30 * DAY).get(L1)!;
    expect(later).toBeLessThan(more);
    expect(later).toBeGreaterThan(0);
  });

  it('Extras count only if they are included', () => {
    const rows = Array.from({ length: 6 }, (_, i) =>
      review(card(L1_EXTRAS, i), { lastReview: new Date(NOW).toISOString() }),
    );
    const off = masteryByDeck(study(plan, rows));
    expect(off.get(L1)).toBe(0);
    const inc = masteryByDeck(
      study(
        {
          ...plan,
          assessments: [{ deckId: ASSESSMENT, includeExtras: true, newPerDay: null }],
        },
        rows,
      ),
    );
    expect(inc.get(L1)).toBeCloseTo(6 / 36, 5);
  });

  it('a card under «No mostrar más» does not count', () => {
    const rows = [
      review(card(L1, 0), { suspended: true, lastReview: new Date(NOW).toISOString() }),
    ];
    expect(masteryByDeck(study(plan, rows)).get(L1)).toBe(0);
    const row = blankRow(card(L1, 1));
    const only = masteryByDeck(study(plan, [{ ...row, suspended: true }]));
    expect(only.get(L1)).toBe(0);
  });

  it('miles of cards, in little time', () => {
    const many: CardSummary[] = Array.from({ length: 30_000 }, (_, i) => card(L1, i));
    const data = study(plan);
    const big: StudyData = {
      ...data,
      deck: { ...data.deck, cards: many },
      rows: new Map(many.map((c) => [cardKey(c), review(c)])),
    };
    const start = performance.now();
    masteryByDeck(big);
    // Some tens of milliseconds on a quiet machine; the margin is for one that is not.
    expect(performance.now() - start).toBeLessThan(1500);
  });
});

describe('the final review', () => {
  const plan = { activations: on(L1) };

  it('«difícil»: a high difficulty, forgotten twice or a leech', () => {
    const c = card(L1, 0);
    expect(isHard(review(c))).toBe(false);
    expect(isHard(review(c, { difficulty: 8 }))).toBe(true);
    expect(isHard(review(c, { lapses: 2 }))).toBe(true);
    expect(isHard(review(c, { leech: true }))).toBe(true);
  });

  it('what was seen, and not what is under «No mostrar más» nor Extras that are off', () => {
    const rows = [
      review(card(L1, 0)),
      review(card(L1, 1), { suspended: true }),
      review(card(L1_EXTRAS, 0)),
      review(card(L2, 0)),
      blankRow(card(L1, 2)),
    ];
    const keys = reviewPools(study(plan, rows, {}, ASSESSMENT)).all.map((c) => c.noteGuid);
    // A lecture turned off still has what was seen of it.
    expect(keys.sort()).toEqual([card(L1, 0).noteGuid, card(L2, 0).noteGuid].sort());
    const inc = study(
      { ...plan, assessments: [{ deckId: ASSESSMENT, includeExtras: true, newPerDay: null }] },
      rows,
      {},
      ASSESSMENT,
    );
    expect(reviewPools(inc).all).toHaveLength(3);
  });

  it('the marked and the difficult ones', () => {
    const rows = [
      review(card(L1, 0)),
      review(card(L1, 1), { flag: 1 }),
      review(card(L1, 2), { difficulty: 8 }),
    ];
    const data = study(plan, rows, {}, ASSESSMENT);
    const { hard } = reviewPools(data);
    expect(hard.map((c) => c.noteGuid).sort()).toEqual([
      card(L1, 1).noteGuid,
      card(L1, 2).noteGuid,
    ]);
    // A mark made during the review counts, also taking one away.
    const marks = new Map([
      [cardKey(card(L1, 0)), 1],
      [cardKey(card(L1, 1)), 0],
    ]);
    expect(
      reviewPools(data, marks)
        .hard.map((c) => c.noteGuid)
        .sort(),
    ).toEqual([card(L1, 0).noteGuid, card(L1, 2).noteGuid]);
  });

  it('starts by what one is closer to forgetting, with siblings apart', () => {
    const old = new Date(NOW - 40 * DAY).toISOString();
    const rows = [
      review(card(L1, 0), { lastReview: new Date(NOW - DAY).toISOString() }),
      review(card(L1, 1), { lastReview: old }),
      review(card(L1, 2), { lastReview: old, ord: 1, noteGuid: card(L1, 1).noteGuid }),
      review(card(L1, 3), { lastReview: new Date(NOW - 20 * DAY).toISOString() }),
    ];
    const data = study(plan, rows, {}, ASSESSMENT);
    data.deck.cards.push({ ...card(L1, 1), ord: 1 });
    const { all } = reviewPools(data);
    expect(all[0]!.noteGuid).toBe(card(L1, 1).noteGuid);
    for (let i = 1; i < all.length; i++) {
      expect(all[i]!.noteGuid).not.toBe(all[i - 1]!.noteGuid);
    }
    expect(all).toHaveLength(4);
  });

  it('«Otra vez» goes back to the end of the round, «Bien» takes it out', () => {
    const a = card(L1, 0);
    const b = card(L1, 1);
    let round = startRound([a, b]);
    // Without showing the answer, nothing happens.
    expect(answerRound(round, 'good')).toBe(round);
    round = answerRound(revealCard(round), 'again');
    expect(round).toMatchObject({ queue: [b, a], again: 1, done: 0, revealed: false });
    round = answerRound(revealCard(round), 'good');
    round = answerRound(revealCard(round), 'again');
    expect(round.queue).toEqual([a]);
    round = answerRound(revealCard(round), 'good');
    expect(round).toMatchObject({ queue: [], total: 2, done: 2, again: 2 });
  });
});
