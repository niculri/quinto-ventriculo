// Figures of an article joined into one, shown one at a time with arrows right under the image: the slides share their
// places (images, arrows, captions), each as tall as its tallest, so stepping through them moves nothing.

import { galleryStrings } from './strings/gallery.strings';

export function makeGallery(figures: HTMLElement[]): HTMLElement {
  const doc = figures[0]!.ownerDocument;
  const gallery = doc.createElement('figure');
  gallery.className = 'figure gallery';
  const track = doc.createElement('div');
  track.className = 'gallery-track';
  figures[0]!.before(gallery);
  figures.forEach((figure, i) => {
    figure.classList.add('gallery-slide');
    if (i === 0) figure.classList.add('is-current');
    else figure.setAttribute('inert', '');
    track.append(figure);
  });
  const nav = doc.createElement('div');
  nav.className = 'gallery-nav';
  nav.append(
    stepButton(doc, -1, galleryStrings.previous),
    count(doc, 1, figures.length),
    stepButton(doc, 1, galleryStrings.next),
  );
  track.append(nav);
  gallery.append(track);
  setDisabled(gallery, 0, figures.length);
  return gallery;
}

function stepButton(doc: Document, step: number, label: string) {
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'gallery-step';
  button.dataset.step = String(step);
  button.setAttribute('aria-label', label);
  return button;
}

function count(doc: Document, at: number, of: number) {
  const span = doc.createElement('span');
  span.className = 'gallery-count';
  span.setAttribute('aria-live', 'polite');
  span.textContent = galleryStrings.count(at, of);
  return span;
}

function setDisabled(gallery: Element, at: number, of: number) {
  for (const button of gallery.querySelectorAll<HTMLButtonElement>('.gallery-step')) {
    const next = at + Number(button.dataset.step);
    button.disabled = next < 0 || next >= of;
  }
}

/** Steps the gallery of a clicked arrow; false when the click was not on one. */
export function stepGallery(target: EventTarget | null): boolean {
  const button = target instanceof Element ? target.closest('.gallery-step') : null;
  const gallery = button?.closest('.gallery');
  if (!(button instanceof HTMLButtonElement) || !gallery) return false;
  const slides = [...gallery.querySelectorAll('.gallery-slide')];
  const at = slides.findIndex((s) => s.classList.contains('is-current'));
  const next = Math.min(slides.length - 1, Math.max(0, at + Number(button.dataset.step)));
  slides.forEach((slide, i) => {
    slide.classList.toggle('is-current', i === next);
    slide.toggleAttribute('inert', i !== next);
  });
  gallery.querySelector('.gallery-count')!.textContent = galleryStrings.count(
    next + 1,
    slides.length,
  );
  setDisabled(gallery, next, slides.length);
  // At an end the arrow just used turns off, and the browser would send its focus to the page: it goes to the other.
  if (button.disabled && button.ownerDocument.activeElement === button) {
    gallery.querySelector<HTMLButtonElement>('.gallery-step:not(:disabled)')!.focus();
  }
  return true;
}
