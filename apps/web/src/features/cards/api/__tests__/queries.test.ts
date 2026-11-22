// Tests what the cards pages read: nothing of the student's rows without a scope, and only the failed answers.
import type { RatedAnswer } from '@qv/schema/user';
import { QueryClient } from '@tanstack/react-query';
import { cardKey } from '@qv/study';
import { describe, expect, it, vi } from 'vitest';
import type { StudyRepository } from '../../../progress/api/repository';
import type { CardsScope } from '../../../catalog/model/scope';
import { failedQuery, scopeRowsQuery } from '../queries';

describe('the rows of a scope', () => {
  it('are not read without a scope', () => {
    const options = scopeRowsQuery({} as StudyRepository, null);
    expect(options.enabled).toBe(false);
    expect(options.queryKey.at(-1)).toBe('');
  });

  it('are the rows of the scope’s decks, keyed by its deck', async () => {
    const cards = vi.fn(async () => []);
    const scope = { node: { id: '4' }, deckIds: ['20', '21'] } as unknown as CardsScope;
    const options = scopeRowsQuery({ cards } as unknown as StudyRepository, scope);
    expect(options.enabled).toBe(true);
    expect(options.queryKey.at(-1)).toBe('4');
    await new QueryClient().query(options);
    expect(cards).toHaveBeenCalledWith(['20', '21']);
  });
});

describe('the failed cards', () => {
  it('are the keys of the answers «Otra vez» since the day’s start', async () => {
    const answer = (noteGuid: string, rating: RatedAnswer['rating']): RatedAnswer => ({
      noteGuid,
      ord: 0,
      rating,
      reviewedAt: '2026-11-01T12:00:00.000Z',
    });
    const ratedSince = vi.fn(async () => [
      answer('a', 1),
      answer('b', 3),
      answer('a', 1),
      answer('c', 2),
    ]);
    const options = failedQuery({ ratedSince } as unknown as StudyRepository, 1_800_000_000, true);
    const failed = await new QueryClient().query(options);
    expect(failed).toEqual(new Set([cardKey({ noteGuid: 'a', ord: 0 })]));
    expect(ratedSince).toHaveBeenCalledWith(new Date(1_800_000_000_000));
  });
});
