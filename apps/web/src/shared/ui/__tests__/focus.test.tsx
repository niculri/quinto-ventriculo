// Tests focus mode: a screen turns it on while it is shown and off when it goes; with no frame around it, nothing breaks.
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FocusContext, useFocusMode } from '../focus';

describe('focus mode', () => {
  it('follows the screen, and is off once the screen goes', () => {
    const setFocus = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <FocusContext value={setFocus}>{children}</FocusContext>
    );
    const { rerender, unmount } = renderHook(({ on }) => useFocusMode(on), {
      wrapper,
      initialProps: { on: true },
    });
    expect(setFocus).toHaveBeenLastCalledWith(true);
    rerender({ on: false });
    expect(setFocus).toHaveBeenLastCalledWith(false);
    unmount();
    expect(setFocus).toHaveBeenLastCalledWith(false);
  });

  it('without a frame that hides the menu, is turned on harmlessly', () => {
    expect(() => renderHook(() => useFocusMode(true)).unmount()).not.toThrow();
  });
});
