// The cover's own state: «Descartar» armed for 4 s (instead of a browser confirm()), and the focus on the tab of the
// section when one comes from another tab.
import { useEffect, useRef, useState } from 'react';

export function useDiscardArm() {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return { armed, setArmed };
}

export function useTabFocus(focusTab: boolean, active: number) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    if (focusTab) tabRefs.current[active]?.focus({ preventScroll: true });
  }, [focusTab, active]);
  return tabRefs;
}
