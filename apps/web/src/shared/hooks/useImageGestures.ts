// Pinch, drag, tap and double tap over the stage of the image viewer.
import { useRef } from 'react';
import type { PointerEvent, RefObject } from 'react';
import { panBy, pinch, toggledScale, zoomAt } from '../lib/zoom';
import type { Point, View } from '../lib/zoom';
import type { Ready, SetView } from './useStageView';

const TAP_MOVE = 10;
const DOUBLE_TAP_MS = 320;

interface Gesture {
  pointers: Map<number, Point>;
  start: View;
  from: Point[];
  moved: boolean;
  downAt: number;
}

function insideImage(ready: Ready | null, p: Point) {
  if (!ready) return false;
  const { view: v, image: i } = ready;
  return (
    p.x >= v.x && p.y >= v.y && p.x <= v.x + i.width * v.scale && p.y <= v.y + i.height * v.scale
  );
}

/** The gesture with the finger that just went down: each new finger starts it again from where the image is now. */
function press(
  previous: Gesture | null,
  view: View,
  pointerId: number,
  at: Point,
  timeStamp: number,
): Gesture {
  const g = previous ?? {
    pointers: new Map<number, Point>(),
    start: view,
    from: [],
    moved: false,
    downAt: timeStamp,
  };
  g.pointers.set(pointerId, at);
  g.start = view;
  g.from = [...g.pointers.values()];
  if (g.pointers.size > 1) g.moved = true;
  return g;
}

/** The view the fingers ask for now: pinched with two, moved with one; none while one has not left its place. */
function dragged(g: Gesture, ready: Ready): View | null {
  const now = [...g.pointers.values()];
  if (now.length >= 2 && g.from.length >= 2) {
    return pinch(g.start, [g.from[0]!, g.from[1]!], [now[0]!, now[1]!], ready.image, ready.stage);
  }
  const dx = now[0]!.x - g.from[0]!.x;
  const dy = now[0]!.y - g.from[0]!.y;
  if (!g.moved && Math.hypot(dx, dy) < TAP_MOVE) return null;
  g.moved = true;
  return panBy(g.start, dx, dy, ready.image, ready.stage);
}

/** A finger's second tap close in time and place to the first. */
function isDoubleTap(last: { at: number; point: Point } | null, at: number, point: Point) {
  return (
    !!last &&
    at - last.at < DOUBLE_TAP_MS &&
    Math.hypot(point.x - last.point.x, point.y - last.point.y) < 40
  );
}

export function useImageGestures(
  stageRef: RefObject<HTMLElement | null>,
  ready: Ready | null,
  setView: SetView,
  onTapOutside: () => void,
) {
  const gestureRef = useRef<Gesture | null>(null);
  const lastTapRef = useRef<{ at: number; point: Point } | null>(null);
  const lastPointerRef = useRef('mouse');

  const local = (e: { clientX: number; clientY: number }): Point => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
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
    lastPointerRef.current = e.pointerType;
    if (!ready || (e.pointerType === 'mouse' && e.button !== 0)) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // the pointer already went up: the gesture goes on without capture
    }
    gestureRef.current = press(gestureRef.current, ready.view, e.pointerId, local(e), e.timeStamp);
  };

  const onPointerMove = (e: PointerEvent) => {
    const g = gestureRef.current;
    if (!g || !ready || !g.pointers.has(e.pointerId)) return;
    g.pointers.set(e.pointerId, local(e));
    const next = dragged(g, ready);
    if (next) setView(next);
  };

  const onPointerUp = (e: PointerEvent) => {
    const g = gestureRef.current;
    if (!g?.pointers.has(e.pointerId)) return;
    const point = g.pointers.get(e.pointerId)!;
    g.pointers.delete(e.pointerId);
    if (g.pointers.size) {
      g.start = ready?.view ?? g.start;
      g.from = [...g.pointers.values()];
      return;
    }
    gestureRef.current = null;
    if (g.moved || e.type === 'pointercancel') return;
    if (!insideImage(ready, point)) {
      onTapOutside();
      return;
    }
    // A mouse has its own double click (onDoubleClick); a finger, two taps close in time and place.
    if (e.pointerType === 'mouse') return;
    if (isDoubleTap(lastTapRef.current, e.timeStamp, point)) {
      lastTapRef.current = null;
      toggleAt(point);
    } else {
      lastTapRef.current = { at: e.timeStamp, point };
    }
  };

  // A browser may also fire dblclick after a finger's double tap (Chrome on Android does): toggling twice undid it.
  const onDoubleClick = (e: { clientX: number; clientY: number }) => {
    if (lastPointerRef.current !== 'mouse') return;
    const p = local(e);
    if (insideImage(ready, p)) toggleAt(p);
  };

  return {
    toggleAt,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onDoubleClick,
    },
  };
}
