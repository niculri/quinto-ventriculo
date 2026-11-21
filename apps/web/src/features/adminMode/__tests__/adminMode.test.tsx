// Tests adminStudyRepository: studying in the admin mode reads the user's choices and writes nothing.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fullAnkiStudy } from '../../../test/fakes/repositories';
import { localStudyRepository } from '../../progress/api/repository';
import { adminStudyRepository, sharedWithAdminMode } from '../adminMode';
import { adminKeys } from '../../admin/api/queries';
import { releaseKeys } from '../../admin/api/releases';
import { reportKeys } from '../../reports/api/queries';
import { studyKeys } from '../../progress/queries';

afterEach(() => window.localStorage.clear());

describe('the admin mode', () => {
  it('studying in the admin mode writes nothing in the real repository, and starts from what the user chose', async () => {
    const real = fullAnkiStudy();
    await real.setDeckActivation('20', true);
    const activations = await real.deckActivations();
    const writes = vi.fn();
    const spied = new Proxy(real, {
      get(target, key, receiver) {
        const v: unknown = Reflect.get(target, key, receiver);
        if (typeof v !== 'function') return v;
        const name = String(key);
        return (...args: unknown[]) => {
          if (!/^(preferences|deckActivations|assessmentSettings)$/.test(name)) writes(name);
          return (v as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    });
    const preview = adminStudyRepository(spied);
    expect((await preview.preferences())?.fullAnki).toBe(true);
    expect(await preview.deckActivations()).toEqual(activations);
    await preview
      .recordReview({
        card: { noteGuid: 'g', ord: 0, deckId: '20' },
        rating: 3,
        expectedUpdatedAt: null,
        state: {
          phase: 'learning',
          interday: false,
          remainingSteps: 1,
          due: new Date().toISOString(),
          interval: 0,
          stability: 1,
          difficulty: 5,
          reps: 1,
          lapses: 0,
          lastReview: new Date().toISOString(),
          leech: false,
        },
        log: {},
      } as unknown as Parameters<typeof preview.recordReview>[0])
      .catch(() => undefined);
    await preview.setDeckActivation('21', true);
    expect(writes).not.toHaveBeenCalled();
    expect(await real.deckActivations()).toEqual(activations);
    const again = adminStudyRepository(localStudyRepository(null));
    expect(await again.deckActivations()).toEqual([]);
  });

  it('the cache it shares with the site is the user’s, their preferences and the administration panel’s, by their own keys', () => {
    for (const key of [
      adminKeys.isAdmin,
      adminKeys.access,
      adminKeys.unpublished,
      releaseKeys.overview,
      releaseKeys.texts('fp'),
      reportKeys.queue,
      reportKeys.mine,
      studyKeys.preferences,
    ]) {
      expect(sharedWithAdminMode(key)).toBe(true);
    }
    for (const key of [
      adminKeys.siteSettings,
      adminKeys.usage,
      adminKeys.catalog,
      studyKeys.plan,
      studyKeys.cards('20'),
    ]) {
      expect(sharedWithAdminMode(key)).toBe(false);
    }
  });
});
