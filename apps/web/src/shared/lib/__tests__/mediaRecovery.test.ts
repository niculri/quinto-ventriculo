// Tests what a page does with its signed images: signed again before they expire (each link once) or once when they
// fail expired; any other failure a notice with «Reintentar» in their own space, never as narrow as a broken icon.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FreshMedia, RenewMedia } from '../signedMedia';
import { fallbackSize, patchMedia, watchMedia } from '../mediaRecovery';

const NOW = 1_800_000_000;
const PATH = '/api/media/notes/aaaa.webp';
const url = (e: number) => `${PATH}?e=${e}&s=s${e}`;
const EXPIRED = url(NOW - 10);
const FRESH = url(NOW + 86_400);
const HOUR = 3600;

const freshWith =
  (found: string | null): FreshMedia =>
  (path) =>
    path === PATH ? found : null;

function image(src: string | null, { loaded = false, width = 0 } = {}): HTMLImageElement {
  const img = document.createElement('img');
  if (src !== null) img.setAttribute('src', src);
  img.alt = 'Esquema';
  Object.defineProperty(img, 'complete', { configurable: true, get: () => loaded });
  Object.defineProperty(img, 'naturalWidth', { configurable: true, get: () => (loaded ? 10 : 0) });
  img.getBoundingClientRect = () => ({ width }) as DOMRect;
  return img;
}

function add(root: ParentNode, ...imgs: HTMLImageElement[]) {
  for (const img of imgs) {
    const figure = document.createElement('figure');
    figure.append(img);
    root.append(figure);
  }
}

function article(...imgs: HTMLImageElement[]) {
  const root = document.createElement('div');
  add(root, ...imgs);
  document.body.append(root);
  return root;
}

/** Watched before its images come, so that only their failures count (the planning has its own tests). */
function watched(renew: RenewMedia, ...imgs: HTMLImageElement[]) {
  const root = article();
  const watcher = watchMedia(root, renew);
  add(root, ...imgs);
  return { root, watcher };
}

const fail = (img: HTMLImageElement) => img.dispatchEvent(new Event('error'));
const load = (img: HTMLImageElement) => img.dispatchEvent(new Event('load'));
const noticeOf = (img: HTMLImageElement) =>
  img.previousElementSibling instanceof HTMLElement &&
  img.previousElementSibling.getAttribute('role') === 'group'
    ? img.previousElementSibling
    : null;
const settle = () => new Promise((r) => setTimeout(r, 0));
const says = (img: HTMLImageElement, text: string) =>
  vi.waitFor(() => expect(noticeOf(img)!.querySelector('[role="status"]')).toHaveTextContent(text));
const visibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => {
  vi.useFakeTimers({ now: NOW * 1000, toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(document, 'visibilityState');
  document.body.replaceChildren();
});

describe('patchMedia', () => {
  it('gives only the images that have not loaded their new URL', () => {
    const waiting = image(EXPIRED);
    const drawn = image(EXPIRED, { loaded: true });
    const other = image('/api/media/otra.webp?e=1&s=x');
    const plain = image('/logo.svg');
    const empty = image(null);
    const root = article(waiting, drawn, other, plain, empty);
    patchMedia(root, freshWith(FRESH));
    expect(waiting.getAttribute('src')).toBe(FRESH);
    expect(waiting.loading).not.toBe('eager');
    expect(drawn.getAttribute('src')).toBe(EXPIRED);
    expect(other.getAttribute('src')).toBe('/api/media/otra.webp?e=1&s=x');
    expect(plain.getAttribute('src')).toBe('/logo.svg');
    expect(empty.hasAttribute('src')).toBe(false);
  });

  it('an image that already has its URL is not touched', () => {
    const img = image(FRESH);
    const set = vi.spyOn(img, 'setAttribute');
    patchMedia(article(img), freshWith(FRESH));
    expect(set).not.toHaveBeenCalled();
  });

  it('one hidden behind its notice loads at once with its new URL', async () => {
    const img = image(FRESH);
    img.loading = 'lazy';
    const { root } = watched(vi.fn(), img);
    fail(img);
    await settle();
    patchMedia(root, freshWith(url(NOW + 2 * 86_400)));
    expect(img.loading).toBe('eager');
    expect(img.getAttribute('src')).toBe(url(NOW + 2 * 86_400));
  });
});

describe('fallbackSize', () => {
  it('as wide as it was shown, never wider than its place, and with the shape of its attributes', () => {
    expect(fallbackSize(720, 380, 300)).toEqual({
      width: '100%',
      maxWidth: '300px',
      aspectRatio: '720 / 380',
    });
    expect(fallbackSize(undefined, 380, 0)).toEqual({ width: '100%' });
  });
});

describe('a failed image', () => {
  it('expired, is signed again once, and only the src of the ones that have not loaded changes', async () => {
    const img = image(EXPIRED);
    const below = image(EXPIRED);
    const renew = vi.fn(() => Promise.resolve(freshWith(FRESH)));
    watched(renew, img, below);
    fail(img);
    await settle();
    expect(renew).toHaveBeenCalledExactlyOnceWith(PATH, NOW);
    expect(img.getAttribute('src')).toBe(FRESH);
    expect(below.getAttribute('src')).toBe(FRESH);
    expect(noticeOf(img)).toBeNull();

    // The new URL fails too: no second renewal, the notice.
    fail(img);
    await settle();
    expect(renew).toHaveBeenCalledTimes(1);
    expect(noticeOf(img)).not.toBeNull();
  });

  it('not expired, shows the notice in its own space without asking for anything; its text comes a moment later', async () => {
    const img = image(FRESH, { width: 320 });
    img.setAttribute('width', '720');
    img.setAttribute('height', '380');
    const renew = vi.fn();
    const { root } = watched(renew, img);
    fail(img);
    await settle();
    expect(renew).not.toHaveBeenCalled();
    const notice = noticeOf(img)!;
    expect(notice).toHaveAccessibleName('Imagen: Esquema');
    expect(notice.querySelector('[role="status"]')).toHaveTextContent('');
    await says(img, 'No se pudo cargar la imagen');
    expect(notice.querySelector('button')).toHaveTextContent('Reintentar');
    expect(notice.style.maxWidth).toBe('320px');
    expect(notice.style.aspectRatio).toBe('720 / 380');
    expect(img.style.display).toBe('none');
    // A second failure does not add another notice.
    fail(img);
    await settle();
    expect(root.querySelectorAll('[role="group"]')).toHaveLength(1);
  });

  it('without a size of its own (a card’s image), the notice takes the width there is, not its broken icon’s', async () => {
    const img = image(FRESH, { width: 16 });
    watched(vi.fn(), img);
    fail(img);
    await settle();
    const notice = noticeOf(img)!;
    expect(notice.style.width).toBe('100%');
    expect(notice.style.maxWidth).toBe('');
    expect(notice.style.aspectRatio).toBe('');
  });

  it.each([
    ['brings no URL', () => Promise.resolve(freshWith(null))],
    ['brings the same URL', () => Promise.resolve(freshWith(EXPIRED))],
    ['brings one already expired', () => Promise.resolve(freshWith(url(NOW - 1)))],
    ['fails', () => Promise.reject(new Error('sin red'))],
  ])('a renewal that %s ends in the notice', async (_, renew) => {
    const img = image(EXPIRED);
    watched(renew, img);
    fail(img);
    await settle();
    expect(img.getAttribute('src')).toBe(EXPIRED);
    expect(noticeOf(img)).not.toBeNull();
  });

  it('one whose src changed while the renewal was on its way is left as it is', async () => {
    const img = image(EXPIRED);
    let answer = (_: FreshMedia) => undefined as unknown;
    const renew = () => new Promise<FreshMedia>((r) => (answer = r));
    watched(renew, img);
    fail(img);
    img.setAttribute('src', FRESH);
    answer(freshWith(url(NOW + 99)));
    await settle();
    expect(img.getAttribute('src')).toBe(FRESH);
    expect(noticeOf(img)).toBeNull();
  });
});

describe('«Reintentar»', () => {
  it('asks for a URL still valid again, and the image takes its place back with the focus', async () => {
    const img = image(FRESH);
    img.tabIndex = 0;
    img.loading = 'lazy';
    img.style.display = 'block';
    const { root } = watched(vi.fn(), img);
    fail(img);
    await settle();
    const button = noticeOf(img)!.querySelector('button')!;
    button.focus();
    const set = vi.spyOn(img, 'setAttribute');
    const outside = vi.fn();
    root.addEventListener('click', outside);
    button.click();
    expect(outside).not.toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith('src', FRESH);
    expect(img.loading).toBe('eager');
    await says(img, 'Cargando la imagen…');

    // It fails again: the notice says so again; then it loads.
    fail(img);
    await settle();
    await says(img, 'No se pudo cargar la imagen');
    button.click();
    load(img);
    expect(root.querySelector('[role="group"]')).toBeNull();
    expect(img.style.display).toBe('block');
    expect(img.hasAttribute('data-media-failed')).toBe(false);
    expect(document.activeElement).toBe(img);
  });

  it('on an expired image signs it again, even after a renewal that failed', async () => {
    const img = image(EXPIRED);
    const renew = vi
      .fn()
      .mockResolvedValueOnce(freshWith(null))
      .mockResolvedValueOnce(freshWith(FRESH));
    watched(renew, img);
    fail(img);
    await settle();
    noticeOf(img)!.querySelector('button')!.click();
    await settle();
    expect(renew).toHaveBeenCalledTimes(2);
    expect(img.getAttribute('src')).toBe(FRESH);
    load(img);
    expect(noticeOf(img)).toBeNull();
    // The focus was not on the button, and the image is not focusable: it stays where it was.
    expect(document.activeElement).toBe(document.body);
  });

  it('in a Shadow DOM the focus comes back too, and a notice taken out of the page still works', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    watchMedia(shadow, vi.fn());
    const img = image(FRESH);
    img.tabIndex = 0;
    shadow.append(img);
    fail(img);
    await settle();
    const button = noticeOf(img)!.querySelector('button')!;
    button.focus();
    button.click();
    load(img);
    expect(shadow.activeElement).toBe(img);

    const loose = image(FRESH);
    const box = document.createElement('div');
    box.append(loose);
    shadow.append(box);
    fail(loose);
    await settle();
    box.remove();
    noticeOf(loose)!.querySelector('button')!.click();
    load(loose);
    expect(noticeOf(loose)).not.toBeNull();
  });
});

describe('the images not loaded yet', () => {
  it('are signed again at once when their links expire within two hours, each link once', async () => {
    const soon = image(url(NOW + HOUR));
    const drawn = image(url(NOW + HOUR), { loaded: true });
    const renew = vi.fn(() => Promise.resolve(freshWith(FRESH)));
    const root = article(soon, drawn);
    const watcher = watchMedia(root, renew);
    await vi.waitFor(() => expect(soon.getAttribute('src')).toBe(FRESH));
    expect(renew).toHaveBeenCalledExactlyOnceWith(PATH, NOW + 2 * HOUR);
    expect(drawn.getAttribute('src')).toBe(url(NOW + HOUR));
    watcher.stop();
  });

  it('a renewal that brings nothing is not asked for again, nor when the page comes back', async () => {
    const soon = image(url(NOW + HOUR));
    const renew = vi.fn(() => Promise.reject(new Error('sin red')));
    const watcher = watchMedia(article(soon), renew);
    await vi.waitFor(() => expect(renew).toHaveBeenCalledTimes(1));
    visibility('visible');
    await settle();
    expect(renew).toHaveBeenCalledTimes(1);
    watcher.stop();
  });

  it('later ones wait until two hours before they expire; hidden, until the page comes back', async () => {
    vi.useFakeTimers({ now: NOW * 1000, toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    const later = image(url(NOW + 5 * HOUR));
    const renew = vi.fn(() => Promise.resolve(freshWith(FRESH)));
    const root = article(later);
    const watcher = watchMedia(root, renew);
    await vi.advanceTimersByTimeAsync(3 * HOUR * 1000);
    expect(renew).not.toHaveBeenCalled();
    visibility('hidden');
    await vi.advanceTimersByTimeAsync(1000);
    expect(renew).not.toHaveBeenCalled();
    visibility('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(renew).toHaveBeenCalledExactlyOnceWith(PATH, NOW + 5 * HOUR + 1);
    expect(later.getAttribute('src')).toBe(FRESH);

    // An image that comes with the content after it is planned when the page says so.
    const next = image(url(NOW + 4 * HOUR));
    add(root, next);
    watcher.plan();
    await vi.advanceTimersByTimeAsync(HOUR * 1000);
    expect(renew).toHaveBeenCalledTimes(2);
    watcher.stop();
  });

  it('a link far beyond what a timer can wait (a clock set weeks back) is looked at again then, not in a loop', async () => {
    vi.useFakeTimers({ now: NOW * 1000, toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    const set = vi.spyOn(globalThis, 'setTimeout');
    const renew = vi.fn(() => Promise.resolve(freshWith(FRESH)));
    const watcher = watchMedia(article(image(url(NOW + 400 * 24 * HOUR))), renew);
    expect(set.mock.calls.map(([, ms]) => ms)).toEqual([2 ** 31 - 1]);
    await vi.advanceTimersByTimeAsync(2 ** 31 - 1);
    expect(renew).not.toHaveBeenCalled();
    expect(set).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);
    watcher.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a renewal that comes back after it stopped plans nothing', async () => {
    vi.useFakeTimers({ now: NOW * 1000, toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    let arrive = (_: FreshMedia) => {};
    const renew = vi.fn(() => new Promise<FreshMedia>((resolve) => (arrive = resolve)));
    const soon = image(url(NOW + HOUR));
    const later = image(`/api/media/notes/bbbb.webp?e=${NOW + 5 * HOUR}&s=s`);
    const watcher = watchMedia(article(soon, later), renew);
    await vi.advanceTimersByTimeAsync(0);
    expect(renew).toHaveBeenCalledTimes(1);
    watcher.stop();
    arrive(freshWith(FRESH));
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('nothing once it stops, and nothing to plan without them', async () => {
    vi.useFakeTimers({ now: NOW * 1000, toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    const later = image(url(NOW + 5 * HOUR));
    const renew = vi.fn();
    const root = article(later, image('/logo.svg'), image(null));
    const watcher = watchMedia(root, renew);
    watcher.stop();
    visibility('visible');
    await vi.advanceTimersByTimeAsync(6 * HOUR * 1000);
    expect(renew).not.toHaveBeenCalled();
    later.remove();
    watcher.plan();
    await vi.advanceTimersByTimeAsync(6 * HOUR * 1000);
    expect(renew).not.toHaveBeenCalled();
  });
});

describe('watchMedia', () => {
  it('ignores what is not a signed image, a load without a notice, and nothing after it stops', async () => {
    const plain = image('/logo.svg');
    const empty = image(null);
    const img = image(FRESH);
    const div = document.createElement('div');
    const { root, watcher } = watched(vi.fn(), plain, empty, img);
    root.append(div);
    fail(plain);
    fail(empty);
    div.dispatchEvent(new Event('error'));
    div.dispatchEvent(new Event('load'));
    load(img);
    await settle();
    expect(root.querySelector('[role="group"]')).toBeNull();
    watcher.stop();
    fail(img);
    await settle();
    expect(noticeOf(img)).toBeNull();
  });
});
