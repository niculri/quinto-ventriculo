// Tests the key of the first entry of a tab's history: given when it has none, kept when it has one.
import { describe, expect, it, vi } from 'vitest';
import { keyFirstEntry } from '../historyKey';

const history = (state: unknown) => ({ state, replaceState: vi.fn() });

describe('the first entry of the history', () => {
  it('gets a key of its own, keeping what its state had', () => {
    const fresh = history(null);
    keyFirstEntry(fresh, () => 'k1');
    expect(fresh.replaceState).toHaveBeenCalledWith({ key: 'k1' }, '');
    const indexed = history({ idx: 0 });
    keyFirstEntry(indexed, () => 'k2');
    expect(indexed.replaceState).toHaveBeenCalledWith({ idx: 0, key: 'k2' }, '');
  });

  it('keeps the key it already had, as after a reload', () => {
    const kept = history({ key: 'antes', idx: 3 });
    keyFirstEntry(kept);
    expect(kept.replaceState).not.toHaveBeenCalled();
  });

  it('makes keys of the router’s form', () => {
    const fresh = history('texto');
    keyFirstEntry(fresh);
    const [state] = fresh.replaceState.mock.calls[0] as [{ key: string }];
    expect(state.key).toMatch(/^[a-z0-9]{1,8}$/);
  });
});
