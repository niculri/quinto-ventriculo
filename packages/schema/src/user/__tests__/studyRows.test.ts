// The rows of the users database as PostgREST gives them: the card state, its log and the shorter selections.
import { describe, expect, it } from 'vitest';
import { AnswerTodayRow, CardLogRow, CardStateRow, RatedInDeckRow, RatedRow } from '../studyRows';

const ok = (s: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) =>
  s.safeParse(v).success;

describe('CardStateRow', () => {
  const row = {
    note_guid: 'g',
    ord: 0,
    deck_id: '1',
    phase: 'review',
    interday: true,
    remaining_steps: 0,
    due: null,
    interval: 3,
    stability: null,
    difficulty: null,
    reps: 2,
    lapses: 0,
    last_review: null,
    flag: 0,
    suspended: false,
    buried_until: null,
    leech: false,
    updated_at: 't',
  };

  it('a users database from before moved cards has no «retired_at», and one that has it may say null', () => {
    expect(ok(CardStateRow, row)).toBe(true);
    expect(ok(CardStateRow, { ...row, retired_at: null })).toBe(true);
    expect(ok(CardStateRow, { ...row, retired_at: 't' })).toBe(true);
  });

  it('the phase is one of four and the memory fields may be null', () => {
    expect(ok(CardStateRow, { ...row, phase: 'suspended' })).toBe(false);
    for (const phase of ['new', 'learning', 'review', 'relearning'])
      expect(ok(CardStateRow, { ...row, phase })).toBe(true);
    expect(ok(CardStateRow, { ...row, stability: 'x' })).toBe(false);
  });
});

describe('the other selections', () => {
  it('a log row has an action, a phase before and after, and the rest may be null', () => {
    const log = {
      action: 'answer',
      reviewed_at: 't',
      rating: null,
      queue_before: null,
      phase_before: 'new',
      phase_after: 'learning',
      interval: null,
      stability_after: null,
      difficulty_after: null,
      duration_ms: null,
    };
    expect(ok(CardLogRow, log)).toBe(true);
    expect(ok(CardLogRow, { ...log, action: 'delete' })).toBe(false);
    expect(ok(CardLogRow, { ...log, queue_before: 'day_learn' })).toBe(true);
    expect(ok(CardLogRow, { ...log, queue_before: 'dayLearn' })).toBe(false);
  });

  it('a rated row has a rating from 1 to 4 and, in a deck, the deck', () => {
    const rated = { note_guid: 'g', ord: 0, rating: 3, reviewed_at: 't' };
    expect(ok(RatedRow, rated)).toBe(true);
    for (const rating of [0, 5, null]) expect(ok(RatedRow, { ...rated, rating })).toBe(false);
    expect(ok(RatedInDeckRow, { ...rated, deck_id: '1' })).toBe(true);
    expect(ok(RatedInDeckRow, rated)).toBe(false);
  });

  it('what was answered today is a deck and the queue the card came from', () => {
    expect(ok(AnswerTodayRow, { deck_id: '1', queue_before: 'learn' })).toBe(true);
    expect(ok(AnswerTodayRow, { deck_id: '1', queue_before: null })).toBe(false);
  });
});
