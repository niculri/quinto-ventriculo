// The databases' refusals as typed errors: which reason a message carries, which SQLSTATE, and what a function says
// when it refuses.
import { describe, expect, it } from 'vitest';
import { DatabaseError, databaseError } from '../errors';

describe('DatabaseError', () => {
  it('keeps the message and the parts PostgREST gave, and a missing part is null', () => {
    const e = new DatabaseError({
      code: 'P0001',
      message: 'card_changed',
      details: 'd',
      hint: 'h',
    });
    expect(e).toMatchObject({
      name: 'DatabaseError',
      message: 'card_changed',
      code: 'P0001',
      details: 'd',
      hint: 'h',
    });
    const bare = new DatabaseError({ message: 'x' });
    expect([bare.code, bare.details, bare.hint]).toEqual([null, null, null]);
    const nulls = new DatabaseError({ message: 'x', code: null, details: null, hint: null });
    expect([nulls.code, nulls.details, nulls.hint]).toEqual([null, null, null]);
    expect(e).toBeInstanceOf(Error);
  });

  it('says a reason when the message carries it, whole or after the function that raised it', () => {
    expect(new DatabaseError({ message: 'card_changed' }).says('card_changed')).toBe(true);
    expect(new DatabaseError({ message: 'record_review: card_changed' }).says('card_changed')).toBe(
      true,
    );
    expect(new DatabaseError({ message: 'quota_exceeded' }).says('card_changed')).toBe(false);
  });

  it('the refusals that only differ in their sentence are told apart by it', () => {
    expect(
      new DatabaseError({ message: 'a list of at most 500 emails' }).says('too_many_emails'),
    ).toBe(true);
    expect(new DatabaseError({ message: '"list" is required' }).says('list_required')).toBe(true);
    expect(
      new DatabaseError({ message: '"note" has at most 200 characters' }).says('note_too_long'),
    ).toBe(true);
    expect(
      new DatabaseError({ message: 'a list of at most 500 emails' }).says('list_required'),
    ).toBe(false);
  });

  it('one SQLSTATE is shared by several reasons: the code alone does not say which', () => {
    const e = new DatabaseError({ code: 'P0001', message: 'report_blocked' });
    expect(e.hasCode('P0001')).toBe(true);
    expect(e.says('report_blocked')).toBe(true);
    expect(e.says('quota_exceeded')).toBe(false);
  });

  it('has a code if it is any of the ones asked for, and never without one', () => {
    const e = new DatabaseError({ code: '42501', message: 'x' });
    expect(e.hasCode('28000', '42501')).toBe(true);
    expect(e.hasCode('28000', 'P0001')).toBe(false);
    expect(e.hasCode()).toBe(false);
    expect(new DatabaseError({ message: 'x' }).hasCode('42501')).toBe(false);
  });

  it('reads the reason of a «function: reason» refusal, only that function’s and only whole', () => {
    expect(
      new DatabaseError({ message: 'publish_release: stale_fingerprint' }).refusal(
        'publish_release',
      ),
    ).toBe('stale_fingerprint');
    expect(
      new DatabaseError({ message: 'publish_release: stale_fingerprint' }).refusal(
        'revert_release',
      ),
    ).toBeNull();
    expect(
      new DatabaseError({ message: 'publish_release: Stale' }).refusal('publish_release'),
    ).toBeNull();
    expect(
      new DatabaseError({ message: 'x publish_release: a' }).refusal('publish_release'),
    ).toBeNull();
    expect(
      new DatabaseError({ message: 'publish_release: a b' }).refusal('publish_release'),
    ).toBeNull();
  });
});

describe('databaseError', () => {
  it('turns what PostgREST gave into a DatabaseError, and one that already is stays the same', () => {
    const made = databaseError({ code: 'P0002', message: 'nothing_open' });
    expect(made).toBeInstanceOf(DatabaseError);
    expect(made.code).toBe('P0002');
    expect(databaseError(made)).toBe(made);
  });
});
