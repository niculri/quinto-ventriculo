// The student's study data as the code reads it: which phases and actions there are, what a stored card may leave out
// and what a review has to say.
import { describe, expect, it } from 'vitest';
import {
  ActionName,
  AssessmentSetting,
  CardLogEntry,
  HomeCounts,
  Phase,
  QueueName,
  Rating,
  RatedAnswer,
  ReviewInput,
  StoredCard,
  StudyPreferences,
  UserPreset,
} from '../study';

const ok = (s: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) =>
  s.safeParse(v).success;
const ref = { noteGuid: 'g', ord: 0, deckId: '1' };
const stored = {
  ...ref,
  phase: 'new',
  interday: false,
  remainingSteps: 0,
  due: null,
  interval: 0,
  stability: null,
  difficulty: null,
  reps: 0,
  lapses: 0,
  lastReview: null,
  flag: 0,
  suspended: false,
  buriedUntil: null,
  leech: false,
  updatedAt: '',
};

describe('the names', () => {
  it('a card is in one of four phases, comes from one of four queues and an action is one of nine', () => {
    expect(Phase.options).toEqual(['new', 'learning', 'review', 'relearning']);
    expect(QueueName.options).toEqual(['new', 'learn', 'day_learn', 'review']);
    expect(ActionName.options).toHaveLength(9);
    expect(ok(ActionName, 'answer')).toBe(true);
    expect(ok(ActionName, 'delete')).toBe(false);
  });

  it('a rating is 1, 2, 3 or 4, as a number', () => {
    for (const r of [1, 2, 3, 4]) expect(ok(Rating, r)).toBe(true);
    for (const r of [0, 5, '3', 2.5]) expect(ok(Rating, r)).toBe(false);
  });
});

describe('StoredCard', () => {
  it('a card moved out of its deck says when it was retired, and one that was not leaves it out or says null', () => {
    expect(ok(StoredCard, stored)).toBe(true);
    expect(ok(StoredCard, { ...stored, retiredAt: null })).toBe(true);
    expect(ok(StoredCard, { ...stored, retiredAt: 't' })).toBe(true);
    expect(ok(StoredCard, { ...stored, retiredAt: 5 })).toBe(false);
  });

  it('needs its deck, since the same card may be asked for in any deck it is in', () => {
    const { deckId: _d, ...without } = stored;
    expect(ok(StoredCard, without)).toBe(false);
  });
});

describe('the preferences', () => {
  const prefs = {
    timeZone: 'America/Santiago',
    dayStartsAt: 4,
    learnAheadMinutes: 20,
    newCardsIgnoreReviewLimit: false,
    applyAllParentLimits: false,
    fullAnki: false,
    fourButtons: false,
    welcomeSeen: false,
    semester: null,
    addedCourses: [],
    removedCourses: [],
    dismissed: [],
  };

  it('has all of its keys, the semester may be null', () => {
    expect(ok(StudyPreferences, prefs)).toBe(true);
    expect(ok(StudyPreferences, { ...prefs, semester: 2 })).toBe(true);
    const { welcomeSeen: _w, ...without } = prefs;
    expect(ok(StudyPreferences, without)).toBe(false);
  });

  it('a preset the student made may replace one of the author’s, or be its own', () => {
    expect(
      ok(UserPreset, {
        id: '1',
        name: 'Mía',
        replaces: null,
        config: { newPerDay: 5 },
        updatedAt: 't',
      }),
    ).toBe(true);
    expect(
      ok(UserPreset, { id: '1', name: 'Mía', replaces: 'Default', config: {}, updatedAt: 't' }),
    ).toBe(true);
    expect(ok(UserPreset, { id: '1', name: 'Mía', config: {}, updatedAt: 't' })).toBe(false);
  });
});

describe('an assessment’s settings', () => {
  const base = { deckId: '4', includeExtras: false, newPerDay: null };

  it('the date, when it was set and the days of final review are optional, and the date may be null', () => {
    expect(ok(AssessmentSetting, base)).toBe(true);
    expect(ok(AssessmentSetting, { ...base, examDate: null, examDateSetAt: null })).toBe(true);
    expect(
      ok(AssessmentSetting, {
        ...base,
        examDate: '2026-11-18',
        examDateSetAt: 't',
        finalReviewDays: 3,
      }),
    ).toBe(true);
    expect(ok(AssessmentSetting, { ...base, finalReviewDays: null })).toBe(false);
  });
});

describe('a review and its log', () => {
  it('a rated answer has its card, its rating from 1 to 4 and when', () => {
    expect(ok(RatedAnswer, { noteGuid: 'g', ord: 0, rating: 4, reviewedAt: 't' })).toBe(true);
    expect(ok(RatedAnswer, { noteGuid: 'g', ord: 0, rating: 9, reviewedAt: 't' })).toBe(false);
  });

  it('a review carries the card, who expected it, the new state and who to bury', () => {
    const review = {
      card: ref,
      expectedUpdatedAt: null,
      rating: 1,
      queueBefore: 'review',
      interval: 1,
      lastInterval: 5,
      durationMs: 100,
      state: {
        phase: 'relearning',
        interday: false,
        remainingSteps: 1,
        due: 't',
        interval: 0,
        stability: 1,
        difficulty: 5,
        reps: 3,
        lapses: 1,
        lastReview: 't',
        suspended: false,
        leech: false,
      },
      bury: [ref],
      buriedUntil: 't',
    };
    expect(ok(ReviewInput, review)).toBe(true);
    expect(ok(ReviewInput, { ...review, rBefore: 0.9, cardVersion: 2 })).toBe(true);
    expect(ok(ReviewInput, { ...review, rBefore: null, cardVersion: null })).toBe(true);
    expect(ok(ReviewInput, { ...review, rating: 0 })).toBe(false);
  });

  it('a log entry may have no rating and no queue (an action that is not an answer)', () => {
    const entry = {
      action: 'flag',
      reviewedAt: 't',
      rating: null,
      queueBefore: null,
      phaseBefore: 'new',
      phaseAfter: 'new',
      interval: null,
      stability: null,
      difficulty: null,
      durationMs: null,
    };
    expect(ok(CardLogEntry, entry)).toBe(true);
    expect(ok(CardLogEntry, { ...entry, phaseAfter: 'other' })).toBe(false);
  });

  it('home counts are for decks, with whether the list was cut', () => {
    const due = { noteGuid: 'g', ord: 0, queue: 'l', due: 5 };
    const deck = {
      deckId: '1',
      seen: 0,
      hiddenNew: 0,
      touched: 0,
      suspended: 0,
      recall: 0,
      due: [due],
    };
    expect(ok(HomeCounts, { decks: [deck], truncated: false })).toBe(true);
    expect(
      ok(HomeCounts, { decks: [{ ...deck, due: [{ ...due, queue: 'x' }] }], truncated: false }),
    ).toBe(false);
    expect(ok(HomeCounts, { decks: [] })).toBe(false);
  });
});
