/** The geometry of the image viewer: where the image is and how big, inside the stage. */

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** `x` and `y`: the image's top left corner in the stage, in CSS pixels; `scale` 1 is the image's natural size. */
export interface View {
  scale: number;
  x: number;
  y: number;
}

/** The whole image in sight, never bigger than its natural size. */
export function fitScale(image: Size, stage: Size): number {
  return Math.min(1, stage.width / image.width, stage.height / image.height);
}

/** Up to twice the natural size (a small label of a plate), and at least four times what fits. */
export function maxScale(image: Size, stage: Size): number {
  return Math.max(2, fitScale(image, stage) * 4);
}

function clampAxis(offset: number, length: number, room: number): number {
  if (length <= room) return (room - length) / 2;
  return Math.min(0, Math.max(room - length, offset));
}

export function clampScale(scale: number, image: Size, stage: Size): number {
  return Math.min(maxScale(image, stage), Math.max(fitScale(image, stage), scale));
}

/** Within the limits: centered on an axis where it fits, and without empty borders where it does not. */
export function clampView(view: View, image: Size, stage: Size): View {
  const scale = clampScale(view.scale, image, stage);
  return {
    scale,
    x: clampAxis(view.x, image.width * scale, stage.width),
    y: clampAxis(view.y, image.height * scale, stage.height),
  };
}

export function fitView(image: Size, stage: Size): View {
  return clampView({ scale: 0, x: 0, y: 0 }, image, stage);
}

/** Another scale, keeping the point of the image under `at` where it is. */
export function zoomAt(view: View, wanted: number, at: Point, image: Size, stage: Size): View {
  const scale = clampScale(wanted, image, stage);
  const ratio = scale / view.scale;
  return clampView(
    { scale, x: at.x - (at.x - view.x) * ratio, y: at.y - (at.y - view.y) * ratio },
    image,
    stage,
  );
}

export function isFitted(view: View, image: Size, stage: Size): boolean {
  return view.scale <= fitScale(image, stage) * 1.001;
}

/** A double tap: from what fits to the natural size (twice what fits, if it already fits whole), and back. */
export function toggledScale(view: View, image: Size, stage: Size): number {
  const fit = fitScale(image, stage);
  if (!isFitted(view, image, stage)) return fit;
  return fit < 0.999 ? 1 : Math.min(maxScale(image, stage), fit * 2);
}

export function panBy(view: View, dx: number, dy: number, image: Size, stage: Size): View {
  return clampView({ ...view, x: view.x + dx, y: view.y + dy }, image, stage);
}

/** Two fingers: the scale follows their distance, and the point of the image between them follows them. */
export function pinch(
  start: View,
  from: [Point, Point],
  to: [Point, Point],
  image: Size,
  stage: Size,
): View {
  const distance = ([a, b]: [Point, Point]) => Math.hypot(a.x - b.x, a.y - b.y) || 1;
  const middle = ([a, b]: [Point, Point]) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const m0 = middle(from);
  const m1 = middle(to);
  const scale = clampScale(start.scale * (distance(to) / distance(from)), image, stage);
  const ix = (m0.x - start.x) / start.scale;
  const iy = (m0.y - start.y) / start.scale;
  return clampView({ scale, x: m1.x - ix * scale, y: m1.y - iy * scale }, image, stage);
}
