// Every contract of the users database's functions together, and the usage function the Worker calls as the administrator.
import { describe, expect, it } from 'vitest';
import { ACCESS_RPC } from '../access';
import { ACCOUNT_RPC } from '../account';
import { QUIZ_RPC } from '../quizProgress';
import { REPORTS_RPC } from '../reportsRpc';
import { USERS_RPC } from '../rpc';
import { STUDY_RPC } from '../studyRpc';

describe('USERS_RPC', () => {
  it('has every contract of its parts, once: no function is named twice', () => {
    const parts = [STUDY_RPC, QUIZ_RPC, ACCOUNT_RPC, ACCESS_RPC, REPORTS_RPC];
    const names = parts.flatMap((p) => Object.keys(p));
    expect(new Set(names).size).toBe(names.length);
    expect(Object.keys(USERS_RPC).sort()).toEqual([...names, 'admin_usage'].sort());
  });

  it('each contract has the schema of its arguments and of what it returns', () => {
    for (const contract of Object.values(USERS_RPC)) {
      expect(typeof contract.args.safeParse).toBe('function');
      expect(typeof contract.returns.safeParse).toBe('function');
    }
  });

  it('the usage function takes the groups as a pair or triple of names that may be null, or nothing at all', () => {
    const args = USERS_RPC.admin_usage.args;
    expect(args.safeParse({}).success).toBe(true);
    expect(
      args.safeParse({ p: { decks: { '1': ['a', null, 'c'] }, quizzes: { q: [null, 'b'] } } })
        .success,
    ).toBe(true);
    expect(args.safeParse({ p: { decks: { '1': ['a', 'b'] }, quizzes: {} } }).success).toBe(false);
    expect(args.safeParse({ p: { decks: {}, quizzes: { q: ['a'] } } }).success).toBe(false);
    expect(args.safeParse({ p: { decks: {} } }).success).toBe(false);
    expect(args.safeParse({ p: { decks: {}, quizzes: {}, exact: true } }).success).toBe(true);
    expect(args.safeParse({ p: { decks: {}, quizzes: {}, exact: 'yes' } }).success).toBe(false);
  });
});
