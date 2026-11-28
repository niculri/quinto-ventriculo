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

function clampScale(scale: number, image: Size, stage: Size): number {
  return Math.min(maxScale(image, stage), Math.max(fitScale(image, stage), scale));
}

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

/**
 * Where the viewer opens: what fits, unless the image was shown bigger than that where it was opened (a tall plate in
 * an article). Then it opens as wide as the stage allows, up to its natural size and never smaller than it was, from its
 * top: the rest is a drag away. With `focus` (a point of the image, in fractions of its size: the mask asked on an
 * occlusion), it opens at its natural size (or as it was, if bigger) with that point in the middle of the stage.
 */
export function openView(image: Size, stage: Size, shown?: number, focus?: Point): View {
  const fit = fitScale(image, stage);
  const was = shown ? shown / image.width : 0;
  if (focus) {
    const scale = clampScale(Math.max(1, was), image, stage);
    return clampView(
      {
        scale,
        x: stage.width / 2 - focus.x * image.width * scale,
        y: stage.height / 2 - focus.y * image.height * scale,
      },
      image,
      stage,
    );
  }
  if (was <= fit) return fitView(image, stage);
  const scale = Math.min(
    maxScale(image, stage),
    Math.max(was, Math.min(1, stage.width / image.width)),
  );
  return clampView({ scale, x: 0, y: 0 }, image, stage);
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
