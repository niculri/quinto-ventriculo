// How wide an image is drawn, in CSS px, without its padding and border: what the image viewer opens it at least as.
export function drawnWidth(img: Element): number {
  const style = getComputedStyle(img);
  const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  return Math.max(0, img.clientWidth - padding);
}
