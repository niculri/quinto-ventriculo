// Tests previewStudyRepository: studying in the preview reads the user's choices and writes nothing.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fullAnkiStudy } from '../../../test/render';
import { localStudyRepository } from '../../progress/api/repository';
import { previewStudyRepository } from '../preview';

afterEach(() => window.sessionStorage.clear());

describe('the preview of the draft', () => {
  it('studying in the preview writes nothing in the real repository, and starts from what the user chose', async () => {
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
    const preview = previewStudyRepository(spied);
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
    const again = previewStudyRepository(localStudyRepository(null));
    expect(await again.deckActivations()).toEqual([]);
  });
});
