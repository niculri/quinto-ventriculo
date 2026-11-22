// Tests the keys of the card viewer: which key turns the card or moves, and where they are left alone.

import type { KeyboardEvent } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { viewerKeyDown } from '../viewerKeys';

/** The parts of React's event the viewer reads, with the path the browser gives (empty after the dispatch). */
function press(key: string, origin: EventTarget, path: EventTarget[] = [origin]) {
  const preventDefault = vi.fn();
  const event = { key, target: origin, preventDefault, nativeEvent: { composedPath: () => path } };
  return { event: event as unknown as KeyboardEvent, preventDefault };
}

let content: HTMLDivElement;
let inside: HTMLDivElement;
const toggle = vi.fn();
const go = vi.fn();

beforeEach(() => {
  document.body.innerHTML = '';
  content = document.createElement('div');
  content.setAttribute('role', 'dialog');
  inside = document.createElement('div');
  content.append(inside);
  document.body.append(content);
  toggle.mockClear();
  go.mockClear();
});

const el = (html: string, parent: Element = inside) => {
  parent.insertAdjacentHTML('beforeend', html);
  return parent.lastElementChild!;
};

describe('the keys of the card viewer', () => {
  it.each([' ', 'Enter'])('«%s» turns the card and does not scroll the page', (key) => {
    const { event, preventDefault } = press(key, inside);
    viewerKeyDown(event, content, toggle, go);
    expect(toggle).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it('the arrows move to the next and previous card; other keys do nothing', () => {
    for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'a']) {
      viewerKeyDown(press(key, inside).event, content, toggle, go);
    }
    expect(go.mock.calls).toEqual([[1], [-1]]);
    expect(toggle).not.toHaveBeenCalled();
  });

  it.each(['<button>x</button>', '<a href="#">x</a>', '<details><summary>x</summary></details>'])(
    'space and Enter on a control (%s) activate it instead of turning the card',
    (html) => {
      const control = el(html);
      const target = control.querySelector('summary') ?? control;
      for (const key of [' ', 'Enter'])
        viewerKeyDown(press(key, target).event, content, toggle, go);
      expect(toggle).not.toHaveBeenCalled();
    },
  );

  it('the arrows still move from a button of the card', () => {
    viewerKeyDown(press('ArrowRight', el('<button>x</button>')).event, content, toggle, go);
    expect(go).toHaveBeenCalledWith(1);
  });

  it('a link without a destination is not a control: space turns the card', () => {
    viewerKeyDown(press(' ', el('<a>x</a>')).event, content, toggle, go);
    expect(toggle).toHaveBeenCalledOnce();
  });

  it.each([
    '<input>',
    '<textarea></textarea>',
    '<select></select>',
    '<div contenteditable="true"><p>x</p></div>',
  ])('no key works while typing in a field (%s)', (html) => {
    const field = el(html);
    const target = field.querySelector('p') ?? field;
    for (const key of ['ArrowRight', 'a'])
      viewerKeyDown(press(key, target).event, content, toggle, go);
    expect(go).not.toHaveBeenCalled();
  });

  it('no key works from another dialog opened over the viewer', () => {
    const other = el('<div role="dialog"><p>Reportar</p></div>', document.body);
    viewerKeyDown(press('ArrowRight', other.firstElementChild!).event, content, toggle, go);
    viewerKeyDown(press(' ', other.firstElementChild!).event, content, toggle, go);
    expect([go.mock.calls.length, toggle.mock.calls.length]).toEqual([0, 0]);
  });

  it('a control inside the card is found by the event path, past the shadow host', () => {
    const host = el('<div></div>');
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<button id="toggle">Mostrar todo</button>';
    const button = shadow.querySelector('button')!;
    viewerKeyDown(press(' ', host, [button, shadow, host]).event, content, toggle, go);
    expect(toggle).not.toHaveBeenCalled();
  });

  it('inside the shadow root the dialog check does not apply: the arrows move', () => {
    const host = el('<div></div>');
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<p>texto</p>';
    viewerKeyDown(
      press('ArrowLeft', host, [shadow.querySelector('p')!]).event,
      content,
      toggle,
      go,
    );
    expect(go).toHaveBeenCalledWith(-1);
  });

  it('with an empty event path, reads the event target', () => {
    viewerKeyDown(press(' ', el('<input>'), []).event, content, toggle, go);
    viewerKeyDown(press(' ', inside, []).event, content, toggle, go);
    expect(toggle).toHaveBeenCalledOnce();
  });

  it('a key from outside any element (the window) still works', () => {
    viewerKeyDown(press('ArrowRight', window).event, content, toggle, go);
    expect(go).toHaveBeenCalledWith(1);
  });
});
