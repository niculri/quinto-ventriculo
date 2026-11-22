// Tests Image Occlusion set up on a card side: the canvas size, the masks drawn, «toggle», the M key and the zoom.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { occlusionSnapshot, setupOcclusion } from '../occlusion';
import { shapes } from '../../model/__tests__/occlusionFixtures';

type Call = [string, ...unknown[]];

/** A 2D context that records every method called and every color set, in order. */
function recordingContext() {
  const calls: Call[] = [];
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(state, {
    get(target, key: string) {
      if (key in target) return target[key];
      if (key === 'measureText')
        return (t: string) => ({
          width: t.length * 10,
          actualBoundingBoxAscent: 8,
          actualBoundingBoxDescent: 2,
        });
      return (...args: unknown[]) => calls.push([key, ...args]);
    },
    set(target, key: string, value) {
      target[key] = value;
      if (key === 'fillStyle') calls.push(['fillStyle', value]);
      return true;
    },
  });
  return { ctx, calls };
}

const rect = (cls: string, ord: number, extra = 'data-occludeinactive="1"') =>
  `<div class="${cls}" data-ordinal="${ord}" data-shape="rect" data-left=".1" data-top=".2" data-width=".3" data-height=".4" ${extra}></div>`;
const text =
  '<div class="cloze-inactive" data-ordinal="2" data-shape="text" data-left=".5" data-top=".5" data-text="Rótulo" data-scale="1" data-occludeinactive="1"></div>';

function card(
  op: { masks?: string; image?: boolean; canvas?: boolean; button?: boolean; alt?: string } = {},
) {
  const { masks = rect('cloze', 1), image = true, canvas = true, button = true } = op;
  const root = shapes(
    `<div style="display:none">${masks}</div>` +
      `<div id="image-occlusion-container">${image ? '<img src="x.png" alt="">' : ''}` +
      `${canvas ? '<canvas id="image-occlusion-canvas"></canvas>' : ''}</div>` +
      (button ? '<button id="toggle">Mostrar todo</button>' : ''),
  );
  return {
    root,
    container: root.querySelector<HTMLDivElement>('#image-occlusion-container')!,
    canvas: root.querySelector<HTMLCanvasElement>('#image-occlusion-canvas'),
    img: root.querySelector<HTMLImageElement>('img'),
    button: root.querySelector<HTMLButtonElement>('#toggle'),
  };
}

function setSize(el: Element, props: Record<string, number | boolean>) {
  for (const [k, v] of Object.entries(props)) Object.defineProperty(el, k, { value: v });
}

/** The fills of rectangles, as «x y w h color». */
const fills = (calls: Call[]) => {
  let color = '';
  return calls.flatMap((c) => {
    if (c[0] === 'fillStyle') color = String(c[1]);
    return c[0] === 'fillRect' ? [`${c.slice(1).join(' ')} ${color}`] : [];
  });
};

let frames: FrameRequestCallback[] = [];
const runFrames = () => {
  const pending = frames;
  frames = [];
  for (const f of pending) f(0);
};
let context: ReturnType<typeof recordingContext> | null;

beforeEach(() => {
  frames = [];
  context = recordingContext();
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => frames.push(f));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => context?.ctx as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    return `data:image/png;size=${this.width}x${this.height}`;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('setting up an occlusion (like Anki review.ts)', () => {
  it('does nothing on a side without the container or the canvas', () => {
    const noCanvas = card({ canvas: false });
    setupOcclusion(noCanvas.root)();
    expect(noCanvas.container.textContent).toBe('');
    const noContainer = shapes('<canvas id="image-occlusion-canvas"></canvas>');
    expect(() => setupOcclusion(noContainer)()).not.toThrow();
  });

  it('says there is no image when the container has none', () => {
    const { root, container } = card({ image: false });
    setupOcclusion(root)();
    expect(container.textContent).toBe('No hay ninguna imagen que mostrar.');
  });

  it('on load, fits the canvas to the image in device pixels and draws the masks at those pixels', () => {
    vi.stubGlobal('devicePixelRatio', 2);
    const { root, container, canvas, img } = card({
      masks: rect('cloze', 1) + rect('cloze-inactive', 2),
    });
    setSize(canvas!, { clientWidth: 500, clientHeight: 400 });
    setSize(img!, { naturalWidth: 1000, naturalHeight: 500 });
    setupOcclusion(root);
    img!.dispatchEvent(new Event('load'));
    expect(container.style.aspectRatio).toBe('2 / 1');
    expect([canvas!.width, canvas!.height]).toEqual([1000, 500]);
    expect(context!.calls[0]).toEqual(['clearRect', 0, 0, 1000, 500]);
    expect(fills(context!.calls)).toEqual(['100 100 300 200 #ff8e8e', '100 100 300 200 #ffeba2']);
  });

  it('takes the colors of the masks from the canvas CSS variables', () => {
    const { root, canvas, img } = card();
    canvas!.style.setProperty('--active-shape-color', '#123456');
    setSize(canvas!, { clientWidth: 100, clientHeight: 100 });
    setSize(img!, { naturalWidth: 100, naturalHeight: 100 });
    setupOcclusion(root);
    img!.dispatchEvent(new Event('load'));
    expect(fills(context!.calls)).toEqual(['10 20 30 40 #123456']);
  });

  it('without a device pixel ratio counts one pixel per CSS pixel', () => {
    vi.stubGlobal('devicePixelRatio', 0);
    const { root, canvas, img } = card();
    setSize(canvas!, { clientWidth: 300, clientHeight: 300 });
    setSize(img!, { naturalWidth: 600, naturalHeight: 300 });
    setupOcclusion(root);
    img!.dispatchEvent(new Event('load'));
    expect([canvas!.width, canvas!.height]).toEqual([300, 150]);
  });

  it('draws nothing until the image knows its size', () => {
    const { root, container, canvas, img } = card();
    setSize(canvas!, { clientWidth: 300, clientHeight: 300 });
    setSize(img!, { naturalWidth: 600, naturalHeight: 0 });
    setupOcclusion(root);
    img!.dispatchEvent(new Event('load'));
    expect(container.style.aspectRatio).toBe('');
    expect(context!.calls).toEqual([]);
  });

  it('sizes the canvas but draws nothing when the browser gives no 2D context', () => {
    context = null;
    const { root, canvas, img } = card();
    setSize(canvas!, { clientWidth: 200, clientHeight: 100 });
    setSize(img!, { naturalWidth: 200, naturalHeight: 100 });
    setupOcclusion(root);
    expect(() => img!.dispatchEvent(new Event('load'))).not.toThrow();
    expect([canvas!.width, canvas!.height]).toEqual([200, 100]);
  });

  it('an image already loaded is drawn in the next frame, not before', () => {
    const { root, canvas, img } = card();
    setSize(canvas!, { clientWidth: 100, clientHeight: 100 });
    setSize(img!, { naturalWidth: 100, naturalHeight: 100, complete: true });
    setupOcclusion(root);
    expect(context!.calls).toEqual([]);
    runFrames();
    expect(fills(context!.calls)).toEqual(['10 20 30 40 #ff8e8e']);
  });

  it('an image still loading waits for its load event', () => {
    const { root, canvas, img } = card();
    setSize(canvas!, { clientWidth: 100, clientHeight: 100 });
    setSize(img!, { naturalWidth: 100, naturalHeight: 100, complete: false });
    setupOcclusion(root);
    expect(frames).toHaveLength(0);
  });

  it('a resize of the container redraws in the next frame, and cleaning up stops observing it', () => {
    const observed: Element[] = [];
    let onResize = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          onResize = cb;
        }
        observe(el: Element) {
          observed.push(el);
        }
        disconnect = disconnect;
      },
    );
    const { root, container, canvas, img } = card();
    setSize(canvas!, { clientWidth: 100, clientHeight: 100 });
    setSize(img!, { naturalWidth: 100, naturalHeight: 100 });
    const cleanup = setupOcclusion(root);
    expect(observed).toEqual([container]);
    onResize();
    expect(context!.calls).toEqual([]);
    runFrames();
    expect(fills(context!.calls)).toHaveLength(1);
    cleanup();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('a frame that arrives after the cleanup draws nothing', () => {
    const { root, canvas, img } = card();
    setSize(canvas!, { clientWidth: 100, clientHeight: 100 });
    setSize(img!, { naturalWidth: 100, naturalHeight: 100, complete: true });
    setupOcclusion(root)();
    runFrames();
    expect(context!.calls).toEqual([]);
  });

  it('«toggle» shows only the text shapes and a second press brings the masks back', () => {
    const { root, canvas, img, button } = card({ masks: rect('cloze-inactive', 1) + text });
    setSize(canvas!, { clientWidth: 100, clientHeight: 100 });
    setSize(img!, { naturalWidth: 100, naturalHeight: 100 });
    setupOcclusion(root);
    button!.click();
    expect(canvas!.dataset.onlyText).toBe('1');
    expect(context!.calls.some((c) => c[0] === 'fillText')).toBe(true);
    expect(fills(context!.calls)).not.toContain('10 20 30 40 #ffeba2');
    context!.calls.length = 0;
    button!.click();
    expect(canvas!.dataset.onlyText).toBe('');
    expect(fills(context!.calls)).toContain('10 20 30 40 #ffeba2');
  });

  it('the M key toggles like the button, but not a lowercase m, nor without a visible button', () => {
    const shown = card({ masks: rect('cloze-inactive', 1) });
    const cleanup = setupOcclusion(shown.root);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }));
    expect(shown.canvas!.dataset.onlyText).toBeUndefined();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'M' }));
    expect(shown.canvas!.dataset.onlyText).toBe('1');
    cleanup();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'M' }));
    expect(shown.canvas!.dataset.onlyText).toBe('1');

    const hidden = card({ masks: rect('cloze-inactive', 1, '') });
    setupOcclusion(hidden.root);
    expect(hidden.button!.style.display).toBe('none');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'M' }));
    expect(hidden.canvas!.dataset.onlyText).toBeUndefined();
  });

  it('the M key does nothing on a side without the «toggle» button', () => {
    const { root, canvas } = card({ button: false });
    setupOcclusion(root);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'M' }));
    expect(canvas!.dataset.onlyText).toBeUndefined();
  });

  it('after the cleanup the button and the load event no longer redraw', () => {
    const { root, canvas, img, button } = card({ masks: rect('cloze-inactive', 1) });
    setSize(canvas!, { clientWidth: 100, clientHeight: 100 });
    setSize(img!, { naturalWidth: 100, naturalHeight: 100 });
    setupOcclusion(root)();
    button!.click();
    img!.dispatchEvent(new Event('load'));
    expect(canvas!.dataset.onlyText).toBeUndefined();
    expect(context!.calls).toEqual([]);
  });
});

describe('the picture of an occlusion for the zoom', () => {
  it('is nothing without the canvas or before the image knows its size', () => {
    expect(occlusionSnapshot(card({ canvas: false }).root)).toBeNull();
    expect(occlusionSnapshot(card({ image: false }).root)).toBeNull();
    const { root, img } = card();
    setSize(img!, { naturalWidth: 100, naturalHeight: 0 });
    expect(occlusionSnapshot(root)).toBeNull();
    const noWidth = card();
    setSize(noWidth.img!, { naturalWidth: 0, naturalHeight: 100 });
    expect(occlusionSnapshot(noWidth.root)).toBeNull();
  });

  it('is the image at its natural size with the masks drawn over it', () => {
    const { root, img } = card({ masks: rect('cloze', 1) });
    setSize(img!, { naturalWidth: 800, naturalHeight: 400 });
    expect(occlusionSnapshot(root)).toBe('data:image/png;size=800x400');
    expect(context!.calls[0]).toEqual(['drawImage', img, 0, 0, 800, 400]);
    expect(fills(context!.calls)).toEqual(['80 80 240 160 #ff8e8e']);
  });

  it('keeps the masks hidden when «toggle» hid them on the card', () => {
    const { root, img, canvas } = card({ masks: rect('cloze-inactive', 1) + text });
    setSize(img!, { naturalWidth: 100, naturalHeight: 100 });
    canvas!.dataset.onlyText = '1';
    occlusionSnapshot(root);
    expect(fills(context!.calls)).not.toContain('10 20 30 40 #ffeba2');
    expect(context!.calls.some((c) => c[0] === 'fillText')).toBe(true);
  });

  it('is nothing when the browser gives no 2D context', () => {
    context = null;
    const { root, img } = card();
    setSize(img!, { naturalWidth: 100, naturalHeight: 100 });
    expect(occlusionSnapshot(root)).toBeNull();
  });
});

it('the «toggle» button hides itself without «hide all» masks', () => {
  const without = card({ masks: rect('cloze-highlight', 1, '') });
  setupOcclusion(without.root)();
  expect(without.button!.style.display).toBe('none');
  const withOi = card({ masks: rect('cloze-highlight', 1) });
  setupOcclusion(withOi.root)();
  expect(withOi.button!.style.display).toBe('');
});
