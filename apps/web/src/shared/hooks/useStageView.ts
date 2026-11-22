// The size of the image viewer's stage and the view of the image in it, refitted when either one changes.
import { useEffect, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { clampView, fitView, isFitted } from '../lib/zoom';
import type { Size, View } from '../lib/zoom';

/** What can be done to the image once its size, the stage's and the view are known. */
export interface Ready {
  image: Size;
  stage: Size;
  view: View;
}

export type SetView = Dispatch<SetStateAction<View | null>>;

export function useStageView(stageRef: RefObject<HTMLElement | null>, image: Size | null) {
  const [stage, setStage] = useState<Size | null>(null);
  const [view, setView] = useState<View | null>(null);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const read = () => setStage({ width: el.clientWidth, height: el.clientHeight });
    read();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(read);
    observer?.observe(el);
    return () => observer?.disconnect();
  }, [stageRef]);

  // A new image, or the stage changed (turning the phone): what fitted the last ones fits the new ones, the rest stays
  // in bounds.
  const [fittedFor, setFittedFor] = useState<{ key: string; image: Size; stage: Size } | null>(
    null,
  );
  const sizes =
    image && stage
      ? { key: `${image.width}x${image.height}@${stage.width}x${stage.height}`, image, stage }
      : null;
  if (sizes && sizes.key !== fittedFor?.key) {
    setFittedFor(sizes);
    setView((v) =>
      v && fittedFor && !isFitted(v, fittedFor.image, fittedFor.stage)
        ? clampView(v, sizes.image, sizes.stage)
        : fitView(sizes.image, sizes.stage),
    );
  }
  return { stage, view, setView };
}
