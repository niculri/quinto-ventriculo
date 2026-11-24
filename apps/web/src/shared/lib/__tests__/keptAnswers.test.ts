// Tests for the answers the API client keeps: the oldest goes first, and forgetting makes each path read again once.
import { describe, expect, it } from 'vitest';
import { keptAnswers } from '../keptAnswers';

describe('keptAnswers', () => {
  it('keeps up to its size; reading one makes it the newest', () => {
    const kept = keptAnswers(2);
    kept.keep('/a', 'A', 1);
    kept.keep('/b', 'B', 2);
    expect(kept.get('/a')).toEqual({ tag: 'A', data: 1 });
    kept.keep('/c', 'C', 3);
    expect(kept.get('/b')).toBeUndefined();
    expect(kept.get('/a')?.data).toBe(1);
    expect(kept.get('/c')?.data).toBe(3);
  });

  it('an answer without a validator drops the kept one', () => {
    const kept = keptAnswers();
    kept.keep('/a', 'A', 1);
    kept.keep('/a', null, 2);
    expect(kept.get('/a')).toBeUndefined();
  });

  it('after forgetting, a path must be read again until it is', () => {
    const kept = keptAnswers();
    kept.keep('/a', 'A', 1);
    expect(kept.mustReload('/a')).toBe(false);
    kept.forget();
    expect(kept.get('/a')).toBeUndefined();
    expect(kept.mustReload('/a')).toBe(true);
    kept.keep('/a', 'A2', 1);
    expect(kept.mustReload('/a')).toBe(false);
    expect(kept.mustReload('/b')).toBe(true);
  });
});
