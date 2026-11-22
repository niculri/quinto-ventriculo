// The bridge between the database’s rows and the scheduler: which settings apply in each mode, how a stored card
// becomes a record and back, which presets a deck uses, what the queue sees and which siblings are buried.
import { dayOfStart, dayStartsAt, defaultConfig, newCard } from '@qv/srs';
import type { AnkiTreeDeck } from '@qv/schema/anki';
import { describe, expect, it } from 'vitest';
import { defaultPreferences } from '../preferences';
import {
  QUEUE_NAMES,
  buildQueue,
  cardKey,
  configsFor,
  deckIds,
  globalSettings,
  isHidden,
  presetChoices,
  presetOf,
  queueCards,
  queueInput,
  sameRef,
  siblingsOf,
  siblingsToBury,
  studiedToday,
  subtree,
  timingFor,
  toRecord,
  toStateFields,
  treeDecks,
} from '../scheduler';
import {
  ASSESSMENT,
  CARDS,
  EXTRAS,
  NOON,
  UNIT1,
  UNIT2,
  ZONE,
  makeData,
  reviewRow,
  rowFor,
  treeDecks as sampleDecks,
} from './studyData';

const prefs = defaultPreferences(ZONE);
const [n1o0, n1o1, n2o0, n3o0, n4o0] = CARDS as [
  (typeof CARDS)[0],
  (typeof CARDS)[0],
  (typeof CARDS)[0],
  (typeof CARDS)[0],
  (typeof CARDS)[0],
];

describe('globalSettings', () => {
  const custom = {
    ...prefs,
    learnAheadMinutes: 7,
    newCardsIgnoreReviewLimit: true,
    applyAllParentLimits: false,
  };

  it('in simple mode the assessment’s limits count from every deck below it, whatever the options say', () => {
    expect(globalSettings({ ...custom, fullAnki: false })).toEqual({
      learnAheadSecs: 420,
      newCardsIgnoreReviewLimit: false,
      applyAllParentLimits: true,
    });
  });

  it('in the advanced mode it follows the options the student chose', () => {
    expect(globalSettings({ ...custom, fullAnki: true })).toEqual({
      learnAheadSecs: 420,
      newCardsIgnoreReviewLimit: true,
      applyAllParentLimits: false,
    });
    expect(
      globalSettings({ ...custom, fullAnki: true, applyAllParentLimits: true })
        .applyAllParentLimits,
    ).toBe(true);
  });
});

describe('a stored card and the record the scheduler reads', () => {
  it('a card never seen has no record', () => {
    expect(toRecord(undefined, prefs)).toBeNull();
    expect(toRecord(rowFor(n1o0), prefs)).toBeNull();
    expect(toRecord(rowFor(n1o0, { phase: 'learning', due: null }), prefs)).toBeNull();
  });

  it('a review is a day-based record and its due day is the day its start belongs to', () => {
    const day = 20_400;
    const start = new Date(dayStartsAt(day, ZONE, 4) * 1000).toISOString();
    const record = toRecord(reviewRow(n1o0, { due: start, interval: 9 }), prefs)!;
    expect(record).toMatchObject({ phase: 'review', queue: 'review', due: day, interval: 9 });
  });

  it('a learning card of today is a moment in seconds, and past the rollover it is a day', () => {
    const due = new Date(NOON + 600_000).toISOString();
    const today = toRecord(
      rowFor(n1o0, { phase: 'learning', interday: false, due, lastReview: due }),
      prefs,
    )!;
    expect(today).toMatchObject({ queue: 'learn', due: Math.floor((NOON + 600_000) / 1000) });
    const day = new Date(dayStartsAt(20_401, ZONE, 4) * 1000).toISOString();
    const later = toRecord(
      rowFor(n1o0, { phase: 'relearning', interday: true, due: day, lastReview: null }),
      prefs,
    )!;
    expect(later).toMatchObject({ queue: 'dayLearn', due: 20_401, lastReview: null });
  });

  it('what is written back is what was read: for every queue', () => {
    const day = new Date(dayStartsAt(20_400, ZONE, 4) * 1000).toISOString();
    const moment = new Date(NOON).toISOString();
    const rows = [
      reviewRow(n1o0, { due: day }),
      rowFor(n1o1, {
        phase: 'learning',
        interday: false,
        due: moment,
        lastReview: moment,
        remainingSteps: 2,
      }),
      rowFor(n2o0, {
        phase: 'relearning',
        interday: true,
        due: day,
        lastReview: moment,
        lapses: 1,
      }),
    ];
    for (const row of rows) {
      const record = toRecord(row, prefs)!;
      const back = toStateFields(record, prefs, { suspended: row.suspended, leech: row.leech });
      expect(back).toMatchObject({
        phase: row.phase,
        interday: row.interday,
        due: row.due,
        interval: row.interval,
        remainingSteps: row.remainingSteps,
        lastReview: row.lastReview,
      });
    }
  });

  it('a new record has no due date to store, and the flags travel with the fields', () => {
    const fields = toStateFields({ ...newCard(5), lastReview: null }, prefs, {
      suspended: true,
      leech: true,
    });
    expect(fields).toMatchObject({
      due: null,
      lastReview: null,
      interday: false,
      suspended: true,
      leech: true,
    });
  });

  it('names its queues as the database does', () => {
    expect(QUEUE_NAMES).toEqual({
      new: 'new',
      learn: 'learn',
      dayLearn: 'day_learn',
      review: 'review',
    });
  });
});

describe('isHidden', () => {
  it('a suspended card is hidden, and a buried one while the burial lasts', () => {
    expect(isHidden(undefined, NOON)).toBe(false);
    expect(isHidden(rowFor(n1o0, { suspended: true }), NOON)).toBe(true);
    const until = (ms: number) => rowFor(n1o0, { buriedUntil: new Date(ms).toISOString() });
    expect(isHidden(until(NOON + 1), NOON)).toBe(true);
    expect(isHidden(until(NOON), NOON)).toBe(false);
    expect(isHidden(until(NOON - 1), NOON)).toBe(false);
    expect(isHidden(rowFor(n1o0), NOON)).toBe(false);
  });
});

describe('studiedToday', () => {
  it('counts each answer in its deck and the ones above, by the queue it came from', () => {
    const counted = studiedToday(
      [
        { deckId: UNIT1, queueBefore: 'new' },
        { deckId: UNIT1, queueBefore: 'day_learn' },
        { deckId: UNIT1, queueBefore: 'learn' },
      ],
      sampleDecks(),
    );
    expect(counted.get(ASSESSMENT)).toEqual({ newCount: 1, reviewCount: 1 });
    expect(counted.get('1')).toEqual({ newCount: 1, reviewCount: 1 });
    expect(counted.get(UNIT2)).toBeUndefined();
  });
});

describe('presets', () => {
  const author = [
    { name: 'Default', config: { new: { perDay: 7 } } },
    { name: 'Strict', config: { new: { perDay: 3 } } },
  ];
  const user = (id: string, over = {}) => ({
    id,
    name: `Mine ${id}`,
    replaces: null,
    config: { newPerDay: 11 },
    updatedAt: '',
    ...over,
  });

  it('lists the author’s presets, with the student’s replacement taking the place of one, and then the student’s own', () => {
    const choices = presetChoices(author, [
      user('u1', { replaces: 'Strict', config: { newPerDay: 99 } }),
      user('u2'),
    ]);
    expect(choices.map((c) => c.name)).toEqual(['Default', 'Strict', 'Mine u2']);
    expect(choices[0]!.config.newPerDay).toBe(7);
    expect(choices[1]!.config.newPerDay).toBe(99);
    expect(choices[1]!.row?.id).toBe('u1');
    expect(choices[2]!.ref).toEqual({ kind: 'user', id: 'u2' });
    expect(choices[0]!.row).toBeNull();
  });

  it('two references are the same only if they are the same kind and name or id', () => {
    expect(sameRef({ kind: 'author', name: 'A' }, { kind: 'author', name: 'A' })).toBe(true);
    expect(sameRef({ kind: 'author', name: 'A' }, { kind: 'author', name: 'B' })).toBe(false);
    expect(sameRef({ kind: 'user', id: '1' }, { kind: 'user', id: '1' })).toBe(true);
    expect(sameRef({ kind: 'user', id: '1' }, { kind: 'user', id: '2' })).toBe(false);
    expect(sameRef({ kind: 'user', id: 'A' }, { kind: 'author', name: 'A' })).toBe(false);
  });

  describe('the one a deck uses', () => {
    const choices = presetChoices(author, [user('u1')]);

    it('the student’s own choice first, then the author’s choice for that student, then the deck’s own', () => {
      const settings = (over: object) => [
        { deckId: 'd', presetId: null, authorPreset: null, ...over },
      ];
      expect(presetOf('d', 'Default', choices, settings({ presetId: 'u1' })).name).toBe('Mine u1');
      expect(presetOf('d', 'Default', choices, settings({ authorPreset: 'Strict' })).name).toBe(
        'Strict',
      );
      expect(presetOf('d', 'Strict', choices, []).name).toBe('Strict');
      expect(
        presetOf('d', 'Strict', choices, settings({ deckId: 'other', presetId: 'u1' })).name,
      ).toBe('Strict');
    });

    it('a choice that no longer exists falls back to the deck’s preset, and then to the default settings', () => {
      expect(
        presetOf('d', 'Strict', choices, [{ deckId: 'd', presetId: 'gone', authorPreset: null }])
          .name,
      ).toBe('Strict');
      const none = presetOf('d', null, choices, []);
      expect(none).toMatchObject({
        name: 'Default',
        row: null,
        ref: { kind: 'author', name: 'Default' },
      });
      expect(none.config).toEqual(defaultConfig());
      const unknown = presetOf('d', 'Vanished', choices, []);
      expect(unknown).toMatchObject({ name: 'Vanished', row: null });
      expect(unknown.config).toEqual(defaultConfig());
    });

    it('a student’s own preset does not stand in for the author’s name', () => {
      const clash = presetChoices([], [user('u1', { name: 'Default' })]);
      expect(presetOf('d', 'Default', clash, []).row).toBeNull();
    });
  });
});

describe('the deck tree', () => {
  const tree = (
    id: string,
    name: string,
    parentId: string | null,
    cardCount: number,
  ): AnkiTreeDeck => ({ id, name, parentId, cardCount, preset: 'Default' }) as AnkiTreeDeck;

  it('a deck’s own cards are its count minus its subdecks’, which already hold theirs', () => {
    const out = treeDecks([
      tree('a', 'R', null, 10),
      tree('b', 'R::X', 'a', 4),
      tree('c', 'R::Y', 'a', 3),
    ]);
    expect(out.map((d) => [d.label, d.ownCards])).toEqual([
      ['R', 3],
      ['X', 4],
      ['Y', 3],
    ]);
    expect(out[1]).toMatchObject({ parentId: 'a', authorPreset: 'Default' });
  });

  it('lists the ids of a deck and its subdecks, root first', () => {
    expect(deckIds(makeData().deck)).toEqual(['1', '2', '3', ASSESSMENT, UNIT1, UNIT2, EXTRAS]);
  });

  it('takes a deck and what hangs under it, not a deck that only shares the name’s start', () => {
    const decks = [
      ...sampleDecks(),
      { id: '8', name: 'R::S::C::AB', label: 'AB', parentId: '3', authorPreset: null },
    ];
    expect(subtree(decks, ASSESSMENT).map((d) => d.id)).toEqual([ASSESSMENT, UNIT1, UNIT2, EXTRAS]);
    expect(subtree(decks, 'nope')).toEqual([]);
  });
});

describe('the queue the scheduler sees', () => {
  it('hides what is suspended or buried, and new cards of decks that are not giving new ones', () => {
    const data = makeData({
      active: [UNIT1],
      rows: [
        reviewRow(n1o0, { suspended: true }),
        reviewRow(n1o1, { buriedUntil: new Date(NOON + 3600_000).toISOString() }),
        reviewRow(n3o0, { dueInDays: 0 }),
      ],
    });
    const hidden = Object.fromEntries(queueCards(data, NOON).map((c) => [cardKey(c), c.hidden]));
    expect(hidden).toEqual({
      [cardKey(n1o0)]: true,
      [cardKey(n1o1)]: true,
      [cardKey(n2o0)]: false,
      [cardKey(n3o0)]: false,
      [cardKey(n4o0)]: true,
    });
  });

  it('numbers the cards in the deck’s order', () => {
    expect(queueCards(makeData(), NOON).map((c) => c.index)).toEqual([0, 1, 2, 3, 4]);
  });

  it('what the preset says of new cards is replaced in simple mode by the assessment’s number', () => {
    const data = makeData({
      over: {
        plan: {
          activations: [{ deckId: UNIT1, active: true }],
          answeredDecks: [],
          medianAnswerMs: null,
          assessments: [{ deckId: ASSESSMENT, includeExtras: false, newPerDay: 2 }],
        },
      },
    });
    const configs = configsFor(data, NOON);
    expect(configs.get(UNIT1)!.newPerDay).toBe(2);
    expect(configs.get('1')!.newPerDay).toBe(1_000_000);
    expect(buildQueue(data, UNIT1, NOON).main).toHaveLength(2);
  });

  it('gives the queue every deck of the collection, the settings of the mode and the timing of the student’s zone', () => {
    const input = queueInput(makeData(), UNIT1, NOON);
    expect(input.rootDeckId).toBe(UNIT1);
    expect(input.decks.map((d) => d.id)).toHaveLength(7);
    expect(input.deckList).toBe(false);
    expect(input.timing).toEqual(timingFor(prefs, NOON));
    expect(
      queueInput(makeData(), UNIT1, NOON, undefined, undefined, undefined, true).deckList,
    ).toBe(true);
  });

  it('what was answered today counts against the day’s limits', () => {
    const base = makeData({
      over: {
        plan: {
          activations: [{ deckId: UNIT1, active: true }],
          answeredDecks: [],
          medianAnswerMs: null,
          assessments: [{ deckId: ASSESSMENT, includeExtras: false, newPerDay: 3 }],
        },
      },
    });
    const answered = { ...base, answers: [{ deckId: UNIT1, queueBefore: 'new' as const }] };
    expect(buildQueue(answered, UNIT1, NOON).main).toHaveLength(2);
  });

  it('the timing is the student’s day: at the rollover hour a day ends', () => {
    const before = timingFor({ ...prefs, dayStartsAt: 4 }, Date.parse('2026-11-19T06:59:00Z'));
    const after = timingFor({ ...prefs, dayStartsAt: 4 }, Date.parse('2026-11-19T07:01:00Z'));
    expect(after.today).toBe(before.today + 1);
    expect(dayOfStart(after.nextDayAt - 86_400, ZONE, 4)).toBe(after.today);
  });
});

describe('siblings', () => {
  it('are the other cards of the same note in the deck', () => {
    expect(siblingsOf(makeData().deck, n1o0)).toEqual([{ noteGuid: 'n1', ord: 1, deckId: UNIT1 }]);
    expect(siblingsOf(makeData().deck, n2o0)).toEqual([]);
  });

  describe('to bury after an answer', () => {
    const burying = (over: object) => ({ ...defaultConfig(), ...over });
    const data = (rows: ReturnType<typeof reviewRow>[]) => makeData({ rows });
    const buried = (
      queue: Parameters<typeof siblingsToBury>[2],
      config: object,
      rows = [] as ReturnType<typeof reviewRow>[],
    ) => siblingsToBury(data(rows), n1o0, queue, burying(config), NOON).map((s) => cardKey(s));

    it('nobody when the preset buries nothing', () => {
      expect(buried('new', {})).toEqual([]);
    });

    it('new siblings when the preset buries new cards, but not those the day fills with siblings', () => {
      expect(buried('new', { buryNew: true })).toEqual([cardKey(n1o1)]);
      expect(buried('new', { buryNew: true, fillNewWithSiblings: true })).toEqual([]);
    });

    it('review siblings only when a review or an earlier queue was answered', () => {
      const sibling = reviewRow(n1o1, { dueInDays: 0 });
      expect(buried('review', { buryReviews: true }, [sibling])).toEqual([cardKey(n1o1)]);
      expect(buried('learn', { buryReviews: true }, [sibling])).toEqual([cardKey(n1o1)]);
      expect(buried('new', { buryReviews: true }, [sibling])).toEqual([]);
    });

    it('interday-learning siblings only when a day-learning or a learning card was answered', () => {
      const sibling = rowFor(n1o1, {
        phase: 'relearning',
        interday: true,
        due: new Date(dayStartsAt(20_400, ZONE, 4) * 1000).toISOString(),
      });
      const rows = [sibling];
      expect(buried('dayLearn', { buryInterdayLearning: true }, rows)).toEqual([cardKey(n1o1)]);
      expect(buried('review', { buryInterdayLearning: true }, rows)).toEqual([]);
    });

    it('never a sibling that is suspended or already buried', () => {
      const config = { buryNew: true, buryReviews: true };
      expect(buried('review', config, [reviewRow(n1o1, { suspended: true })])).toEqual([]);
      const hidden = reviewRow(n1o1, { buriedUntil: new Date(NOON + 3600_000).toISOString() });
      expect(buried('review', config, [hidden])).toEqual([]);
    });

    it('only the queue each option is about: a new sibling is not buried by the review option', () => {
      expect(buried('review', { buryReviews: true })).toEqual([]);
    });
  });
});
