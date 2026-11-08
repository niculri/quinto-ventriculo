import { createContext, useContext, useEffect } from 'react';

/**
 * «Focus»: a screen that wants the whole window to itself (a test's questions, studying a deck) hides the
 * site's menu while it is on screen.
 */
export const FocusContext = createContext<(on: boolean) => void>(() => {});

export function useFocusMode(on: boolean): void {
  const setFocus = useContext(FocusContext);
  useEffect(() => {
    setFocus(on);
    return () => setFocus(false);
  }, [on, setFocus]);
}
