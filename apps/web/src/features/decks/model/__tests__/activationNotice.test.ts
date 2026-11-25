// Tests the notice of what «Estudiar» turned on: it waits to be armed by its own list, and tells who listens.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { activationNotice } from '../activationNotice';

afterEach(() => activationNotice.clear());

describe('the notice of what was turned on', () => {
  it('is armed only by a list of the same deck, once, and says it to who listens until they stop', () => {
    const listener = vi.fn();
    const stop = activationNotice.subscribe(listener);
    activationNotice.show('a', 'Topic', [{ deckId: '1', active: false }]);
    expect(activationNotice.get()).toMatchObject({ rootId: 'a', armed: false });
    activationNotice.arm('b');
    expect(activationNotice.get()?.armed).toBe(false);
    activationNotice.arm('a');
    activationNotice.arm('a');
    expect(activationNotice.get()?.armed).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    activationNotice.clear();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(activationNotice.get()).toBeNull();
  });
});
