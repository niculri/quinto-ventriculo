import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent, RefObject } from 'react';
import {
  fitScale,
  fitView,
  clampView,
  isFitted,
  maxScale,
  panBy,
  pinch,
  toggledScale,
  zoomAt,
} from './zoom';
import type { Point, Size, View } from './zoom';

const STEP = 1.5;
const TAP_MOVE = 10;
const DOUBLE_TAP_MS = 320;

interface Gesture {
  pointers: Map<number, Point>;
  start: View;
  from: Point[];
  moved: boolean;
  downAt: number;
}

/**
 * Pinch, drag, double tap, wheel and keys over the stage of the viewer. `onTapOutside`: a tap or click that did not
 * move, outside the image (the dark around it closes, as before).
 */
export function useImageZoom(
  stageRef: RefObject<HTMLElement | null>,
  image: Size | null,
  onTapOutside: () => void,
) {
  const [stage, setStage] = useState<Size | null>(null);
  const [view, setView] = useState<View | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const lastTap = useRef<{ at: number; point: Point } | null>(null);
  const lastPointer = useRef('mouse');

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const read = () => setStage({ width: el.clientWidth, height: el.clientHeight });
    read();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(read);
    observer?.observe(el);
    return () => observer?.disconnect();
  }, [stageRef]);

  // A new image, or the stage changed (turning the phone): what fits stays fitted, the rest stays in bounds.
  const [fittedFor, setFittedFor] = useState<string | null>(null);
  const key =
    image && stage ? `${image.width}x${image.height}@${stage.width}x${stage.height}` : null;
  if (image && stage && key !== fittedFor) {
    setFittedFor(key);
    setView((v) =>
      v && !isFitted(v, image, stage) ? clampView(v, image, stage) : fitView(image, stage),
    );
  }

  const ready = image && stage && view ? { image, stage, view } : null;
  // ctrl + wheel is a trackpad's pinch: without preventing it the browser would zoom the whole page.
  const onWheel = useEffectEvent((e: WheelEvent) => {
    const el = stageRef.current;
    if (!ready || !el) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const lines = e.deltaMode === 1 ? 16 : 1;
    const factor = Math.exp(-e.deltaY * lines * (e.ctrlKey ? 0.01 : 0.0015));
    const at = { x: e.clientX - r.left, y: e.clientY - r.top };
    setView((v) => (v ? zoomAt(v, v.scale * factor, at, ready.image, ready.stage) : v));
  });
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const listener = (e: WheelEvent) => onWheel(e);
    el.addEventListener('wheel', listener, { passive: false });
    return () => el.removeEventListener('wheel', listener);
  }, [stageRef]);

  const local = (e: { clientX: number; clientY: number }): Point => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const insideImage = (p: Point) => {
    if (!ready) return false;
    const { view: v, image: i } = ready;
    return (
      p.x >= v.x && p.y >= v.y && p.x <= v.x + i.width * v.scale && p.y <= v.y + i.height * v.scale
    );
  };

  const toggleAt = (p: Point) => {
    if (!ready) return;
    setView(
      zoomAt(
        ready.view,
        toggledScale(ready.view, ready.image, ready.stage),
        p,
        ready.image,
        ready.stage,
      ),
    );
  };

  const onPointerDown = (e: PointerEvent) => {
    lastPointer.current = e.pointerType;
    if (!ready || (e.pointerType === 'mouse' && e.button !== 0)) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // a pointer the browser no longer has (it went up meanwhile): the gesture goes on without capture
    }
    const g = gesture.current ?? {
      pointers: new Map<number, Point>(),
      start: ready.view,
      from: [],
      moved: false,
      downAt: e.timeStamp,
    };
    g.pointers.set(e.pointerId, local(e));
    // Each new finger starts the gesture again from where the image is now.
    g.start = ready.view;
    g.from = [...g.pointers.values()];
    if (g.pointers.size > 1) g.moved = true;
    gesture.current = g;
  };

  const onPointerMove = (e: PointerEvent) => {
    const g = gesture.current;
    if (!g || !ready || !g.pointers.has(e.pointerId)) return;
    g.pointers.set(e.pointerId, local(e));
    const now = [...g.pointers.values()];
    if (now.length >= 2 && g.from.length >= 2) {
      setView(
        pinch(g.start, [g.from[0]!, g.from[1]!], [now[0]!, now[1]!], ready.image, ready.stage),
      );
      return;
    }
    const dx = now[0]!.x - g.from[0]!.x;
    const dy = now[0]!.y - g.from[0]!.y;
    if (!g.moved && Math.hypot(dx, dy) < TAP_MOVE) return;
    g.moved = true;
    setView(panBy(g.start, dx, dy, ready.image, ready.stage));
  };

  const onPointerUp = (e: PointerEvent) => {
    const g = gesture.current;
    if (!g || !g.pointers.has(e.pointerId)) return;
    const point = g.pointers.get(e.pointerId)!;
    g.pointers.delete(e.pointerId);
    if (g.pointers.size) {
      // The finger left behind goes on dragging from here.
      g.start = ready?.view ?? g.start;
      g.from = [...g.pointers.values()];
      return;
    }
    gesture.current = null;
    if (g.moved || e.type === 'pointercancel') return;
    if (!insideImage(point)) {
      onTapOutside();
      return;
    }
    // A mouse has its own double click (onDoubleClick); a finger, two taps close in time and place.
    if (e.pointerType === 'mouse') return;
    const last = lastTap.current;
    if (
      last &&
      e.timeStamp - last.at < DOUBLE_TAP_MS &&
      Math.hypot(point.x - last.point.x, point.y - last.point.y) < 40
    ) {
      lastTap.current = null;
      toggleAt(point);
    } else {
      lastTap.current = { at: e.timeStamp, point };
    }
  };

  // A browser may also fire dblclick after a finger's double tap (Chrome on Android does): toggling twice undid it.
  const onDoubleClick = (e: { clientX: number; clientY: number }) => {
    if (lastPointer.current !== 'mouse') return;
    const p = local(e);
    if (insideImage(p)) toggleAt(p);
  };

  const center = (): Point => ({ x: (stage?.width ?? 0) / 2, y: (stage?.height ?? 0) / 2 });
  const zoomBy = (factor: number) => {
    if (ready)
      setView(zoomAt(ready.view, ready.view.scale * factor, center(), ready.image, ready.stage));
  };
  const toFit = () => {
    if (ready) setView(fitView(ready.image, ready.stage));
  };
  const toggle = () => toggleAt(center());

  const onKeyDown = (e: KeyboardEvent) => {
    if (!ready || e.metaKey || e.ctrlKey || e.altKey) return;
    const pan: Record<string, [number, number]> = {
      ArrowLeft: [60, 0],
      ArrowRight: [-60, 0],
      ArrowUp: [0, 60],
      ArrowDown: [0, -60],
    };
    if (e.key === '+' || e.key === '=') zoomBy(STEP);
    else if (e.key === '-') zoomBy(1 / STEP);
    else if (e.key === '0') toFit();
    else if (pan[e.key] && !isFitted(ready.view, ready.image, ready.stage)) {
      const [dx, dy] = pan[e.key]!;
      setView(panBy(ready.view, dx, dy, ready.image, ready.stage));
    } else return;
    e.preventDefault();
  };

  const fitted = ready ? isFitted(ready.view, ready.image, ready.stage) : true;
  const atMax = ready ? ready.view.scale >= maxScale(ready.image, ready.stage) * 0.999 : true;
  const atNatural = ready ? fitScale(ready.image, ready.stage) >= 0.999 : false;

  return {
    view: ready?.view ?? null,
    fitted,
    atMax,
    atNatural,
    zoomIn: () => zoomBy(STEP),
    zoomOut: () => zoomBy(1 / STEP),
    toggle,
    toFit,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onDoubleClick,
    },
    onKeyDown,
  };
}
