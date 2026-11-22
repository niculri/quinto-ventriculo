// Tests draftOnly: what only the draft has comes from the admin mode's catalog, and a card from its deck.
import { describe, expect, it, vi } from 'vitest';
import { adminKey } from '@qv/schema/http';
import { fakeApi } from '../../../test/fakes/api';
import { CATALOG } from '../../../test/fixtures/catalog';
import { ApiRequestError } from '../../../shared/lib/api';
import { draftOnly } from '../draftOnly';

const withDraft = (keys: Record<string, string[]>) =>
  fakeApi({ catalog: async () => ({ ...CATALOG, adminOnly: keys as never }) });

describe('draftOnly', () => {
  it('says what the catalog marks as draft, and nothing of what is only turned off', async () => {
    const draft = draftOnly(
      withDraft({
        [adminKey('quiz', 'q1')]: ['draft'],
        [adminKey('deck', '20')]: ['hiddenCourse', 'draft'],
        [adminKey('deck', '30')]: ['hiddenCourse'],
      }),
    );
    expect(await draft.is('quiz', 'q1')).toBe(true);
    expect(await draft.is('deck', '20')).toBe(true);
    expect(await draft.is('deck', '30')).toBe(false);
    expect(await draft.is('note', 'x')).toBe(false);
  });

  it('reads the catalog once, and again after a failure', async () => {
    const catalog = vi
      .fn()
      .mockRejectedValueOnce(new ApiRequestError(0, 'offline', 'sin conexión'))
      .mockResolvedValue({ ...CATALOG, adminOnly: { [adminKey('deck', '20')]: ['draft'] } });
    const draft = draftOnly(fakeApi({ catalog }));
    await expect(draft.is('deck', '20')).rejects.toThrow('sin conexión');
    expect(await draft.is('deck', '20')).toBe(true);
    expect(await draft.is('deck', '21')).toBe(false);
    expect(catalog).toHaveBeenCalledTimes(2);
  });

  const catalog = (keys: Record<string, string[]> = {}) => ({
    catalog: async () => ({ ...CATALOG, adminOnly: keys as never }),
  });
  const gone = () => new ApiRequestError(404, 'not_found', 'no');
  /** The cards the students have and the ones the draft has: a card of neither is not found anywhere. */
  const cards = (students: string[], draft: string[]) =>
    vi.fn(
      async (
        guid: string,
        _ord: number,
        _signal?: AbortSignal,
        options?: { published?: boolean },
      ) => {
        if ((options?.published ? students : draft).includes(guid))
          return { deckId: '10' } as never;
        throw gone();
      },
    );

  it('a card is of the draft when the students do not have it and the draft does, deck or no deck marked', async () => {
    const card = cards(['real'], ['real', 'new']);
    const lookup = draftOnly(fakeApi({ ...catalog(), card }));
    expect(await lookup.card({ noteGuid: 'real', ord: 0, deckId: '10' })).toBe(false);
    expect(await lookup.card({ noteGuid: 'new', ord: 0, deckId: '10' })).toBe(true);
  });

  it('a card of a deck only the draft has is of the draft without being looked up', async () => {
    const card = cards([], []);
    const lookup = draftOnly(
      fakeApi({ ...catalog({ [adminKey('deck', '20')]: ['draft'] }), card }),
    );
    expect(await lookup.card({ noteGuid: 'anything', ord: 0, deckId: '20' })).toBe(true);
    expect(card).not.toHaveBeenCalled();
  });

  it('looks each card up once, and the draft only when the students do not have it', async () => {
    const card = cards(['real'], ['real', 'new']);
    const lookup = draftOnly(fakeApi({ ...catalog(), card }));
    await lookup.card({ noteGuid: 'real', ord: 0 });
    await lookup.card({ noteGuid: 'real', ord: 0 });
    expect(card).toHaveBeenCalledTimes(1);
    await lookup.card({ noteGuid: 'new', ord: 1 });
    await lookup.card({ noteGuid: 'new', ord: 1 });
    expect(card.mock.calls.map(([, , , options]) => options?.published ?? false)).toEqual([
      true,
      true,
      false,
    ]);
  });

  it('a card the content no longer has is nobody’s draft; another failure is not hidden, nor remembered', async () => {
    const lookup = draftOnly(fakeApi({ ...catalog(), card: cards([], []) }));
    expect(await lookup.card({ noteGuid: 'gone', ord: 0 })).toBe(false);

    const broken = vi
      .fn()
      .mockRejectedValueOnce(new ApiRequestError(500, 'server', 'caído'))
      .mockResolvedValue({ deckId: '10' });
    const flaky = draftOnly(fakeApi({ ...catalog(), card: broken }));
    await expect(flaky.card({ noteGuid: 'g', ord: 0 })).rejects.toThrow('caído');
    expect(await flaky.card({ noteGuid: 'g', ord: 0 })).toBe(false);
  });
});
