// The wheel over the image viewer's stage zooms the image where the pointer is.
import { useEffect, useEffectEvent } from 'react';
import type { RefObject } from 'react';
import { zoomAt } from '../lib/zoom';
import type { Ready, SetView } from './useStageView';

export function useWheelZoom(
  stageRef: RefObject<HTMLElement | null>,
  ready: Ready | null,
  setView: SetView,
) {
  // ctrl + wheel is a trackpad's pinch: without preventing it the browser would zoom the whole page.
  const onWheel = useEffectEvent((e: WheelEvent) => {
    const el = stageRef.current;
    if (!ready || !el) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const lines = e.deltaMode === 1 ? 16 : 1;
    const factor = Math.exp(-e.deltaY * lines * (e.ctrlKey ? 0.01 : 0.0015));
    const at = { x: e.clientX - r.left, y: e.clientY - r.top };
    // The latest view, not the drawn one: several wheel events can come before a render. Once ready, it is never null.
    setView((v) => zoomAt(v!, v!.scale * factor, at, ready.image, ready.stage));
  });
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const listener = (e: WheelEvent) => onWheel(e);
    el.addEventListener('wheel', listener, { passive: false });
    return () => el.removeEventListener('wheel', listener);
  }, [stageRef]);
}
