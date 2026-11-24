// Pinch, drag, double tap, wheel and keys over the stage of the image viewer.
import type { KeyboardEvent, RefObject } from 'react';
import { fitScale, fitView, isFitted, maxScale, panBy, zoomAt } from '../lib/zoom';
import type { Size } from '../lib/zoom';
import { useImageGestures } from './useImageGestures';
import { useStageView } from './useStageView';
import { useWheelZoom } from './useWheelZoom';

const STEP = 1.5;

const PAN_KEYS: Record<string, [number, number]> = {
  ArrowLeft: [60, 0],
  ArrowRight: [-60, 0],
  ArrowUp: [0, 60],
  ArrowDown: [0, -60],
};

export function useImageZoom(
  stageRef: RefObject<HTMLElement | null>,
  image: Size | null,
  onTapOutside: () => void,
  shown?: number,
) {
  const { stage, view, setView } = useStageView(stageRef, image, shown);
  const ready = image && stage && view ? { image, stage, view } : null;
  useWheelZoom(stageRef, ready, setView);
  const { handlers, toggleAt } = useImageGestures(stageRef, ready, setView, onTapOutside);

  const center = () => ({ x: (stage?.width ?? 0) / 2, y: (stage?.height ?? 0) / 2 });
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
    const pan = PAN_KEYS[e.key];
    if (e.key === '+' || e.key === '=') zoomBy(STEP);
    else if (e.key === '-') zoomBy(1 / STEP);
    else if (e.key === '0') toFit();
    else if (pan && !isFitted(ready.view, ready.image, ready.stage)) {
      setView(panBy(ready.view, pan[0], pan[1], ready.image, ready.stage));
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
    handlers,
    onKeyDown,
  };
}
