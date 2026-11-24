// Tests prefetchCards: the next cards' content, and their images unless the browser saves data.
import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeApi } from '../../../../test/fakes/api';
import { warmImages } from '../../../../shared/lib/warmImages';
import { cardQuery } from '../../../decks/api/queries';
import { prefetchCards } from '../prefetchCards';

vi.mock('../../../../shared/lib/warmImages', () => ({ warmImages: vi.fn() }));

const SRC = '/api/media/cards/next.webp?e=7200&s=signature';
const card = { front: `<img src="${SRC.replace('&', '&amp;')}">`, back: '<b>7</b>' };

const saving = (saveData: boolean) => vi.stubGlobal('navigator', { connection: { saveData } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(warmImages).mockClear();
});

function client(result: Promise<unknown>) {
  const c = new QueryClient();
  const query = vi.spyOn(c, 'query').mockReturnValue(result);
  return { c, query };
}

describe('prefetchCards', () => {
  it('asks for each card’s content and then for its images, after the card on screen', async () => {
    saving(false);
    const { c, query } = client(Promise.resolve(card));
    prefetchCards(c, fakeApi(), [{ noteGuid: 'n1', ord: 0 }]);
    expect(query.mock.calls.map(([o]) => o.queryKey)).toEqual([
      cardQuery(fakeApi(), 'n1', 0).queryKey,
    ]);
    await vi.waitFor(() => expect(warmImages).toHaveBeenCalledWith([SRC], 'after'));
  });

  it('asks for no image when the browser saves data', async () => {
    saving(true);
    const { c } = client(Promise.resolve(card));
    prefetchCards(c, fakeApi(), [{ noteGuid: 'n1', ord: 0 }]);
    await vi.waitFor(() => expect(warmImages).toHaveBeenCalledWith([], 'after'));
  });

  it('lets a card that cannot be read go: it is asked for again when it comes up', async () => {
    saving(false);
    const { c } = client(Promise.reject(new Error('offline')));
    expect(() => prefetchCards(c, fakeApi(), [{ noteGuid: 'n1', ord: 0 }])).not.toThrow();
    await Promise.resolve();
    expect(warmImages).not.toHaveBeenCalled();
  });
});
