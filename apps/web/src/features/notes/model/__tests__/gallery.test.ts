// Tests a gallery: one slide shown at a time, its arrows stepping through them and saying where they are.
import { describe, expect, it } from 'vitest';
import { makeGallery, stepGallery } from '../gallery';

function gallery(n: number) {
  const root = document.createElement('div');
  root.innerHTML = Array.from(
    { length: n },
    (_, i) => `<figure class="figure" style="width:50%"><img alt="${i}"></figure>`,
  ).join('');
  document.body.append(root);
  makeGallery([...root.querySelectorAll<HTMLElement>('figure')]);
  return root.querySelector<HTMLElement>('.gallery')!;
}

const step = (g: Element, n: number) =>
  g.querySelector<HTMLButtonElement>(`.gallery-step[data-step="${n}"]`)!;
const current = (g: Element) =>
  [...g.querySelectorAll('.gallery-slide')].findIndex((s) => s.classList.contains('is-current'));

describe('a gallery', () => {
  it('holds the figures as slides, the first one shown and the others out of reach', () => {
    const g = gallery(3);
    const slides = [...g.querySelectorAll('.gallery-track > .gallery-slide')];
    expect(slides).toHaveLength(3);
    expect(current(g)).toBe(0);
    expect(slides.map((s) => s.hasAttribute('inert'))).toEqual([false, true, true]);
    expect(g.querySelector('.gallery-count')?.textContent).toBe('1 de 3');
    expect(step(g, -1).disabled).toBe(true);
    expect(step(g, 1).disabled).toBe(false);
    expect(step(g, 1).getAttribute('aria-label')).toBe('Imagen siguiente');
    expect(step(g, -1).getAttribute('aria-label')).toBe('Imagen anterior');
  });

  it('steps forward and back, never past its ends', () => {
    const g = gallery(2);
    expect(stepGallery(step(g, 1))).toBe(true);
    expect(current(g)).toBe(1);
    expect(g.querySelector('.gallery-count')?.textContent).toBe('2 de 2');
    expect(step(g, 1).disabled).toBe(true);
    expect(g.querySelectorAll('.gallery-slide')[0]!.hasAttribute('inert')).toBe(true);
    expect(stepGallery(step(g, 1))).toBe(true);
    expect(current(g)).toBe(1);
    stepGallery(step(g, -1));
    expect(current(g)).toBe(0);
  });

  it('keeps the focus in the gallery: at an end, it goes from the arrow that turns off to the other', () => {
    const g = gallery(3);
    step(g, 1).focus();
    stepGallery(step(g, 1));
    expect(document.activeElement).toBe(step(g, 1));
    stepGallery(step(g, 1));
    expect(step(g, 1).disabled).toBe(true);
    expect(document.activeElement).toBe(step(g, -1));
  });

  it('answers only to its arrows', () => {
    const g = gallery(2);
    expect(stepGallery(g.querySelector('img'))).toBe(false);
    expect(stepGallery(null)).toBe(false);
    const loose = document.createElement('button');
    loose.className = 'gallery-step';
    expect(stepGallery(loose)).toBe(false);
    const span = document.createElement('span');
    span.className = 'gallery-step';
    g.append(span);
    expect(stepGallery(span)).toBe(false);
  });
});
