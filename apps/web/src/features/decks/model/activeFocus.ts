// The middle of the masks a card asks for (or reveals), in fractions of its image: where the image viewer opens.
import { shapesIn } from './shapes';
import type { Shape } from './shapes';

function box(s: Shape): [number, number, number, number] {
  switch (s.type) {
    case 'rect':
      return [s.left, s.top, s.left + s.width, s.top + s.height];
    case 'ellipse':
      return [s.left, s.top, s.left + 2 * s.rx, s.top + 2 * s.ry];
    case 'polygon': {
      const xs = s.points.map((p) => p.x);
      const ys = s.points.map((p) => p.y);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    }
    case 'text':
      return [s.left, s.top, s.left, s.top];
  }
}

/** The front's masks (`.cloze`), or the back's revealed ones (`.cloze-highlight`); null on a card without them. */
export function activeFocus(root: ParentNode): { x: number; y: number } | null {
  const shapes = [...shapesIn(root, '.cloze'), ...shapesIn(root, '.cloze-highlight')];
  if (!shapes.length) return null;
  const boxes = shapes.map(box);
  const left = Math.min(...boxes.map((b) => b[0]));
  const top = Math.min(...boxes.map((b) => b[1]));
  const right = Math.max(...boxes.map((b) => b[2]));
  const bottom = Math.max(...boxes.map((b) => b[3]));
  return { x: (left + right) / 2, y: (top + bottom) / 2 };
}
