// Focus mode: a screen that wants the whole window (a test's questions, studying a deck) hides the site's menu while
// it is on screen.
import { createContext, use, useEffect } from 'react';

export const FocusContext = createContext<(on: boolean) => void>(() => {});

export function useFocusMode(on: boolean): void {
  const setFocus = use(FocusContext);
  useEffect(() => {
    setFocus(on);
    return () => setFocus(false);
  }, [on, setFocus]);
}
