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

  it('a card is of the draft when its deck is, and it is looked up only when some deck is', async () => {
    const card = vi.fn(async () => ({ deckId: '20' }) as never);
    const none = draftOnly(fakeApi({ card, catalog: async () => ({ ...CATALOG, adminOnly: {} }) }));
    expect(await none.card({ noteGuid: 'g', ord: 0 })).toBe(false);
    expect(card).not.toHaveBeenCalled();

    const some = draftOnly(
      fakeApi({
        card,
        catalog: async () => ({ ...CATALOG, adminOnly: { [adminKey('deck', '20')]: ['draft'] } }),
      }),
    );
    expect(await some.card({ noteGuid: 'g', ord: 0 })).toBe(true);
    expect(await some.card({ noteGuid: 'g', ord: 0 })).toBe(true);
    expect(card).toHaveBeenCalledTimes(1);
  });

  it('a card the content no longer has is nobody’s draft; another failure is not hidden', async () => {
    const catalog = async () => ({
      ...CATALOG,
      adminOnly: { [adminKey('deck', '20')]: ['draft' as const] },
    });
    const gone = draftOnly(
      fakeApi({
        catalog,
        card: async () => {
          throw new ApiRequestError(404, 'not_found', 'no');
        },
      }),
    );
    expect(await gone.card({ noteGuid: 'g', ord: 0 })).toBe(false);
    const broken = draftOnly(
      fakeApi({
        catalog,
        card: async () => {
          throw new ApiRequestError(500, 'server', 'caído');
        },
      }),
    );
    await expect(broken.card({ noteGuid: 'g', ord: 0 })).rejects.toThrow('caído');
  });
});
