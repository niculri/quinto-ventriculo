// Tests preload: a screen asked for by name loads once its link is reached, never with the data saver on.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { preload, preloadOnIntent, registerPreload, savesData } from '../preload';

afterEach(() => vi.unstubAllGlobals());

const saving = (saveData: boolean) =>
  vi.stubGlobal('navigator', { ...navigator, connection: { saveData } });

describe('preload', () => {
  it('asks the screen registered under the name to load', () => {
    const load = vi.fn().mockResolvedValue(undefined);
    registerPreload('a-screen', load);
    preload('a-screen');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('ignores a name nobody registered and a screen that fails to load', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('offline'));
    registerPreload('a-failing-screen', failing);
    expect(() => preload('nobody')).not.toThrow();
    expect(() => preload('a-failing-screen')).not.toThrow();
    await Promise.resolve();
    expect(failing).toHaveBeenCalledTimes(1);
  });

  it('loads nothing when the browser says the person saves data', () => {
    const load = vi.fn().mockResolvedValue(undefined);
    registerPreload('a-saved-screen', load);
    saving(true);
    expect(savesData()).toBe(true);
    preload('a-saved-screen');
    expect(load).not.toHaveBeenCalled();
    saving(false);
    expect(savesData()).toBe(false);
    preload('a-saved-screen');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('gives a link the handlers of a pointer reaching it and of its focus', () => {
    const load = vi.fn().mockResolvedValue(undefined);
    registerPreload('a-linked-screen', load);
    const props = preloadOnIntent('a-linked-screen');
    expect(Object.keys(props).sort()).toEqual(['onFocus', 'onPointerEnter']);
    props.onPointerEnter();
    props.onFocus();
    expect(load).toHaveBeenCalledTimes(2);
  });
});
