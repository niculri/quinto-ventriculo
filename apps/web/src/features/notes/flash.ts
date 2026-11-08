/** Room around the text of the highlight, the same on every side (px). */
const PAD = 6;

/**
 * Highlights a section's heading for a moment on arriving at it: a rounded rectangle that hugs the text (not the
 * heading's whole box, which carries the rule and the space above an h2).
 */
export function flashHeading(el: HTMLElement): void {
  el.querySelector(':scope > .flash-mark')?.remove();
  const range = document.createRange();
  // Without text measuring (jsdom), no highlight: it is a touch, never a reason to break the page.
  if (typeof range.getBoundingClientRect !== 'function') return;
  range.selectNodeContents(el);
  const text = range.getBoundingClientRect();
  if (!text.width || !text.height) return;
  const box = el.getBoundingClientRect();

  const mark = document.createElement('span');
  mark.className = 'flash-mark';
  mark.setAttribute('aria-hidden', 'true');
  mark.style.left = `${text.left - box.left - PAD}px`;
  mark.style.top = `${text.top - box.top - PAD}px`;
  mark.style.width = `${text.width + 2 * PAD}px`;
  mark.style.height = `${text.height + 2 * PAD}px`;
  el.classList.add('flash-host');
  el.append(mark);
  // A timer, not «animationend»: with reduced motion there is no animation to end.
  window.setTimeout(() => {
    if (!mark.isConnected) return; // a newer flash replaced it
    mark.remove();
    el.classList.remove('flash-host');
  }, 2300);
}
