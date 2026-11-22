// Tests where a key of a study screen comes from: what keeps it (a field, a menu, a dialog) and what it would press.

import { describe, expect, it } from 'vitest';
import { keyOrigin, pressesControl, typedInto } from '../keyOrigin';

const el = (html: string) => {
  const box = document.createElement('div');
  box.innerHTML = html;
  return box.querySelector('[data-here]') ?? box.firstElementChild!;
};

describe('the origin of a key', () => {
  it('is the first element of its path, past a shadow host', () => {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<button>x</button>';
    document.body.append(host);
    const button = shadow.querySelector('button')!;
    let seen: Element | null = null;
    window.addEventListener('keydown', (e) => (seen = keyOrigin(e)), { once: true });
    button.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, composed: true }));
    expect(seen).toBe(button);
    host.remove();
  });

  it('is its target once the event is no longer being dispatched', () => {
    const target = el('<p>texto</p>');
    const e = new KeyboardEvent('keydown');
    Object.defineProperty(e, 'target', { value: target });
    expect(keyOrigin(e)).toBe(target);
  });

  it.each([
    ['<input data-here>', true],
    ['<textarea data-here></textarea>', true],
    ['<div contenteditable="true"><p data-here>x</p></div>', true],
    ['<div role="menu"><div role="menuitem" data-here>x</div></div>', true],
    ['<div role="dialog"><button data-here>x</button></div>', true],
    ['<button data-here>x</button>', false],
  ])('in %s the screen leaves the key alone: %s', (html, kept) => {
    expect(typedInto(el(html))).toBe(kept);
  });

  it.each([
    ['<button data-here>x</button>', true],
    ['<a href="/x" data-here>x</a>', true],
    ['<details><summary data-here>x</summary></details>', true],
    ['<a data-here>x</a>', false],
    ['<p data-here>x</p>', false],
  ])('space or Enter on %s presses it: %s', (html, presses) => {
    expect(pressesControl(el(html))).toBe(presses);
  });

  it('nothing to read from the window or no element', () => {
    expect(typedInto(null)).toBe(false);
    expect(pressesControl(null)).toBe(false);
  });
});
