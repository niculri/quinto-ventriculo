// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.

// Image Occlusion on a card side as Anki's reviewer sets it up (ts/routes/image-occlusion/review.ts, Anki 25.09):
// sizes the canvas, draws the masks of `root` (the card's Shadow DOM) and wires «toggle»; and a picture of it to zoom.

import { canvasPixelSize, shapeProperties } from '../model/shapes';
import { drawShapes } from '../model/drawShapes';
import { decksStrings as s } from '../strings';

/** Anki's `setupImageOcclusion`: sizes the canvas, draws, and wires «toggle» and the M key; returns a cleanup. */
export function setupOcclusion(root: ShadowRoot | HTMLElement): () => void {
  const container = root.querySelector<HTMLDivElement>('#image-occlusion-container');
  const canvas = root.querySelector<HTMLCanvasElement>('#image-occlusion-canvas');
  const image = root.querySelector<HTMLImageElement>('#image-occlusion-container img');
  if (!container || !canvas) return () => {};
  if (!image) {
    container.textContent = s.frame.noImage;
    return () => {};
  }
  let hidden = false;
  let disposed = false;

  const draw = () => {
    if (disposed || !image.naturalWidth || !image.naturalHeight) return;
    container.style.aspectRatio = `${image.naturalWidth / image.naturalHeight}`;
    const size = canvasPixelSize(
      { width: image.naturalWidth, height: image.naturalHeight },
      { width: canvas.clientWidth, height: canvas.clientHeight },
      window.devicePixelRatio || 1,
    );
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawShapes(ctx, root, canvas, shapeProperties(getComputedStyle(canvas)), hidden);
  };

  const toggle = () => {
    hidden = !hidden;
    canvas.dataset.onlyText = hidden ? '1' : '';
    draw();
  };
  const button = root.querySelector<HTMLButtonElement>('#toggle');
  if (button) {
    if (root.querySelector('[data-occludeinactive="1"]')) button.addEventListener('click', toggle);
    else button.style.display = 'none';
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'M' && button && button.style.display !== 'none') toggle();
  };
  window.addEventListener('keydown', onKey);

  if (image.complete) requestAnimationFrame(draw);
  image.addEventListener('load', draw);
  // In the next frame: drawing fixes the container's aspect ratio, which would resize it inside the observer's own
  // callback (the zoom's popup hiding the page's scrollbar did it: «ResizeObserver loop»).
  const observer =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => requestAnimationFrame(draw));
  observer?.observe(container);

  return () => {
    disposed = true;
    window.removeEventListener('keydown', onKey);
    image.removeEventListener('load', draw);
    button?.removeEventListener('click', toggle);
    observer?.disconnect();
  };
}

export function occlusionSnapshot(root: ShadowRoot | HTMLElement): string | null {
  const shown = root.querySelector<HTMLCanvasElement>('#image-occlusion-canvas');
  const image = root.querySelector<HTMLImageElement>('#image-occlusion-container img');
  if (!shown || !image?.naturalWidth || !image.naturalHeight) return null;
  const natural = { width: image.naturalWidth, height: image.naturalHeight };
  const size = canvasPixelSize(natural, natural, 1);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, size.width, size.height);
  drawShapes(ctx, root, canvas, shapeProperties(getComputedStyle(shown)), !!shown.dataset.onlyText);
  return canvas.toDataURL('image/png');
}
