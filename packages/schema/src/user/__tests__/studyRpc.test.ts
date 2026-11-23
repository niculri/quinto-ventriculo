// The contracts of the study functions: the shapes of their compact answers and of what they take.
import { describe, expect, it } from 'vitest';
import { STUDY_RPC } from '../studyRpc';

const ok = (s: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) =>
  s.safeParse(v).success;
const ref = { noteGuid: 'g', ord: 0, deckId: '1' };

describe('the compact answers', () => {
  it('the home counts are a list of tuples, each deck with its due cards as tuples of their own', () => {
    const returns = STUDY_RPC.home_counts.returns;
    expect(ok(returns, {})).toBe(true);
    expect(
      ok(returns, { decks: [['1', 5, 0, 1, 0, 0.5, [['g', 0, 'r', 100]]]], truncated: false }),
    ).toBe(true);
    expect(ok(returns, { decks: [['1', 5, 0, 1, 0, 0.5, [['g', 0, 'x', 100]]]] })).toBe(false);
    expect(ok(returns, { decks: [['1', 5, 0, 1, 0, 0.5]] })).toBe(false);
  });

  it('the heatmap has its days as [day, deck, answers, practice] and what is due as [day, cards]', () => {
    const returns = STUDY_RPC.study_heatmap.returns;
    expect(ok(returns, {})).toBe(true);
    expect(ok(returns, { days: [['2026-11-01', '1', 3, 0]], due: [['2026-11-02', 4]] })).toBe(true);
    expect(ok(returns, { days: [['2026-11-01', '1', 3]] })).toBe(false);
    expect(ok(returns, { due: [['2026-11-02', '4']] })).toBe(false);
  });

  it('home counts ask for decks and a limit, with the decay of each deck optional', () => {
    const args = STUDY_RPC.home_counts.args;
    expect(ok(args, { p_deck_ids: ['1'], p_until: 't' })).toBe(true);
    expect(ok(args, { p_deck_ids: ['1'], p_until: 't', p_decay: { '1': 0.5 } })).toBe(true);
    expect(ok(args, { p_deck_ids: ['1'] })).toBe(false);
    expect(ok(STUDY_RPC.study_heatmap.args, {})).toBe(true);
  });
});

describe('what an answer or an action sends', () => {
  const review = {
    ...ref,
    expectedUpdatedAt: null,
    rating: 3,
    queueBefore: 'new',
    interval: 1,
    lastInterval: 0,
    durationMs: 1200,
    rBefore: null,
    cardVersion: null,
    state: {
      phase: 'learning',
      interday: false,
      remainingSteps: 1,
      due: null,
      interval: 0,
      stability: null,
      difficulty: null,
      reps: 1,
      lapses: 0,
      lastReview: null,
      suspended: false,
      leech: false,
    },
    bury: [],
    buriedUntil: null,
  };

  it('a review has the card, the rating from 1 to 4, the queue it came from, its new state and who to bury', () => {
    const args = STUDY_RPC.record_review.args;
    expect(ok(args, { a: review })).toBe(true);
    expect(ok(args, { a: { ...review, rating: 5 } })).toBe(false);
    expect(ok(args, { a: { ...review, queueBefore: 'dayLearn' } })).toBe(false);
    expect(ok(args, { a: { ...review, bury: [ref] } })).toBe(true);
    expect(ok(STUDY_RPC.record_review.returns, { actionId: 'a', updatedAt: 't' })).toBe(true);
  });

  it('burying takes the cards and until when, and whether the whole note; suspending only the note flag', () => {
    expect(ok(STUDY_RPC.bury_cards.args, { cards: [ref], until: 't' })).toBe(true);
    expect(ok(STUDY_RPC.bury_cards.args, { cards: [ref], until: 't', note: true })).toBe(true);
    expect(ok(STUDY_RPC.bury_cards.args, { cards: [ref] })).toBe(false);
    expect(ok(STUDY_RPC.suspend_cards.args, { cards: [ref], note: false })).toBe(true);
    expect(ok(STUDY_RPC.bury_cards.returns, 3)).toBe(true);
    expect(ok(STUDY_RPC.bury_cards.returns, '3')).toBe(false);
  });

  it('setting one flag takes a card, setting many takes cards; forgetting may reset the counts', () => {
    expect(ok(STUDY_RPC.set_flag.args, { card: ref, flag: 2 })).toBe(true);
    expect(ok(STUDY_RPC.set_flag.returns, null)).toBe(true);
    expect(ok(STUDY_RPC.set_flags.args, { cards: [ref], flag: 0 })).toBe(true);
    expect(ok(STUDY_RPC.forget_cards.args, { cards: [ref], reset_counts: true })).toBe(true);
    expect(ok(STUDY_RPC.unsuspend_cards.args, { cards: [ref] })).toBe(true);
    expect(ok(STUDY_RPC.unbury_cards.args, { cards: ref })).toBe(false);
  });

  it('undoing may find nothing to undo', () => {
    expect(ok(STUDY_RPC.undo_last_review.returns, null)).toBe(true);
    expect(ok(STUDY_RPC.undo_last_review.returns, { ...ref, action: 'answer', rating: 3 })).toBe(
      true,
    );
    expect(ok(STUDY_RPC.undo_last_review.args, undefined)).toBe(true);
  });

  it('undoing may say which action it expects, with the answer’s id or without it', () => {
    const args = STUDY_RPC.undo_last_review.args;
    expect(ok(args, { expected: { ...ref, action: 'answer', actionId: 'a' } })).toBe(true);
    expect(ok(args, { expected: { ...ref, action: 'bury_note' } })).toBe(true);
    expect(ok(args, { expected: { ...ref, action: 'other' } })).toBe(false);
    expect(ok(args, { expected: ref })).toBe(false);
  });

  it('the preferences go as a patch, the lists as what they gain and lose, and come back whole', () => {
    const { args, returns } = STUDY_RPC.save_study_preferences;
    expect(ok(args, { p: {} })).toBe(true);
    expect(ok(args, { p: { fullAnki: true, semester: null } })).toBe(true);
    expect(ok(args, { p: { dismissed: { add: ['tip-search'], remove: [] } } })).toBe(true);
    expect(ok(args, { p: { dismissed: ['tip-search'] } })).toBe(false);
    expect(ok(returns, { fullAnki: true })).toBe(false);
  });

  it('practice has a list of decks with counts, and answers whether it was capped', () => {
    expect(ok(STUDY_RPC.record_practice.args, { p: { decks: [{ deckId: '1', n: 5 }] } })).toBe(
      true,
    );
    expect(ok(STUDY_RPC.record_practice.returns, { day: null, practice: 0, capped: false })).toBe(
      true,
    );
    expect(ok(STUDY_RPC.record_practice.returns, { day: null, practice: 0 })).toBe(false);
  });

  it('the card states of some decks come as rows', () => {
    expect(ok(STUDY_RPC.card_states_of_decks.args, { p_deck_ids: ['1'] })).toBe(true);
    expect(ok(STUDY_RPC.card_states_of_decks.returns, [])).toBe(true);
  });
});
