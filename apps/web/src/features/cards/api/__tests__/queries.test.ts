// Tests what the cards pages read: nothing of the student's rows without a scope, only the failed answers, and the
// thumbnails signed again.
import type { RatedAnswer } from '@qv/schema/user';
import { QueryClient } from '@tanstack/react-query';
import { cardKey } from '@qv/study';
import { describe, expect, it, vi } from 'vitest';
import type { StudyRepository } from '../../../progress/api/repository';
import type { CardsScope } from '../../../catalog/model/scope';
import { fakeApi } from '../../../../test/fakes/api';
import { failedQuery, renewThumbs, scopeRowsQuery } from '../queries';

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

describe('the thumbnails signed again', () => {
  it('one signature for all of them, asked for once while it is new; another image is not one', async () => {
    const api = fakeApi();
    const thumbSignature = vi.spyOn(api, 'thumbSignature');
    const renew = renewThumbs(new QueryClient(), api);
    const fresh = await renew('/api/media/cards/thumb/a.webp', 0);
    await renew('/api/media/cards/thumb/b.webp', 0);
    expect(thumbSignature).toHaveBeenCalledTimes(1);
    expect(fresh('/api/media/cards/thumb/b.webp')).toBe(
      '/api/media/cards/thumb/b.webp?e=4102444800&p=cards%2Fthumb%2F&s=prueba',
    );
    expect(fresh('/api/media/cards/a.webp')).toBeNull();
  });
});
