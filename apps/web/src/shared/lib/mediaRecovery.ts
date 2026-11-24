// What a page does with its signed images: signed again before they expire, or once when they fail expired (only the
// `src` changes); any other failure, or a second one, leaves a notice with «Reintentar» in the image's own space.
import type { CSSProperties } from 'react';
import { mediaStrings as s } from '../strings/media.strings';
import {
  RENEW_BEFORE_SEC,
  isExpired,
  mediaExpiry,
  mediaPath,
  secondsNow,
  untilRenewal,
} from './signedMedia';
import type { FreshMedia, RenewMedia } from './signedMedia';

/** The notice's look, the same in an article, a card's Shadow DOM (inline, as no sheet reaches it) and a test. */
export const FALLBACK_STYLE = {
  box: {
    position: 'relative',
    zIndex: 1,
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    minHeight: '4.5rem',
    padding: '0.75rem',
    border: '1px dashed var(--border-strong, #cfcbc2)',
    borderRadius: '8px',
    background: 'var(--surface-2, #f1efea)',
    color: 'var(--muted, #5b6670)',
    font: '500 0.875rem/1.4 var(--font-sans, system-ui, sans-serif)',
    textAlign: 'center',
  },
  button: {
    margin: 0,
    padding: '0.4rem 0.9rem',
    border: '1px solid var(--border, #e3e0d9)',
    borderRadius: '8px',
    background: 'var(--surface, #fff)',
    color: 'var(--ink, #1a1f24)',
    font: 'inherit',
    cursor: 'pointer',
  },
} as const satisfies Record<string, CSSProperties>;

/** As wide as the image was shown (never wider than its place) and, from its attributes, as tall as it would be. */
export function fallbackSize(
  width: number | undefined,
  height: number | undefined,
  shown: number,
): CSSProperties {
  return {
    width: '100%',
    ...(shown > 0 ? { maxWidth: `${shown}px` } : {}),
    ...(width && height ? { aspectRatio: `${width} / ${height}` } : {}),
  };
}

/** The marker of an image hidden behind its notice. */
const FAILED = 'data-media-failed';
/** A live region is announced when its text changes, not when it appears already full. */
export const ANNOUNCE_MS = 50;

/** The focused element of the image's own tree: inside a Shadow DOM the document only sees its host. */
function activeIn(img: HTMLImageElement): Element | null {
  const tree = img.getRootNode();
  return tree instanceof ShadowRoot || tree instanceof Document ? tree.activeElement : null;
}

const loaded = (img: HTMLImageElement) => img.complete && img.naturalWidth > 0;
const attr = (img: HTMLImageElement, name: string) => Number(img.getAttribute(name)) || undefined;
const none: FreshMedia = () => null;

/**
 * Gives the images that have not loaded their new URL; the ones already drawn keep theirs, so none flickers. One hidden
 * behind its notice loads at once: lazy, it would never come into view.
 */
export function patchMedia(root: ParentNode, fresh: FreshMedia): void {
  for (const img of root.querySelectorAll('img')) {
    const src = img.getAttribute('src');
    const path = src ? mediaPath(src) : null;
    const url = path ? fresh(path) : null;
    if (!url || url === src || loaded(img)) continue;
    if (img.hasAttribute(FAILED)) img.loading = 'eager';
    img.setAttribute('src', url);
  }
}

interface Notice {
  box: HTMLElement;
  text: HTMLElement;
  display: string;
  focused: boolean;
}

/**
 * The notice, before the image it replaces. A broken image measures only its icon or its alt (16 px in Chromium), so its
 * width is taken only when its attributes give its shape; otherwise the notice takes the width there is.
 */
function noticeFor(img: HTMLImageElement, onRetry: (button: HTMLButtonElement) => void): Notice {
  const doc = img.ownerDocument;
  const width = attr(img, 'width');
  const height = attr(img, 'height');
  const box = doc.createElement('span');
  const drawn = width && height ? img.getBoundingClientRect().width : 0;
  Object.assign(box.style, FALLBACK_STYLE.box, fallbackSize(width, height, drawn));
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', s.image(img.alt));
  const text = doc.createElement('span');
  text.setAttribute('role', 'status');
  setTimeout(() => {
    if (!text.textContent) text.textContent = s.failed;
  }, ANNOUNCE_MS);
  const button = doc.createElement('button');
  button.type = 'button';
  button.textContent = s.retry;
  Object.assign(button.style, FALLBACK_STYLE.button);
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    onRetry(button);
  });
  box.append(text, button);
  img.before(box);
  img.setAttribute(FAILED, '');
  const notice = { box, text, display: img.style.display, focused: false };
  img.style.display = 'none';
  return notice;
}

/** An image that fails: signed again once if its link expired, the notice otherwise. */
function watchFailures(root: Element | ShadowRoot, renew: RenewMedia): () => void {
  const tried = new Set<string>();
  const notices = new Map<HTMLImageElement, Notice>();

  const showFallback = (img: HTMLImageElement) => {
    const current = notices.get(img);
    if (current) current.text.textContent = s.failed;
    else
      notices.set(
        img,
        noticeFor(img, (button) => retry(img, button)),
      );
  };

  const recover = async (img: HTMLImageElement, src: string, path: string) => {
    if (!isExpired(src, secondsNow()) || tried.has(src)) {
      showFallback(img);
      return;
    }
    tried.add(src);
    const fresh = await renew(path, secondsNow()).catch(() => none);
    if (img.getAttribute('src') !== src) return;
    const url = fresh(path);
    if (!url || url === src || isExpired(url, secondsNow())) showFallback(img);
    else patchMedia(root, fresh);
  };

  const retry = (img: HTMLImageElement, button: HTMLButtonElement) => {
    const current = notices.get(img)!;
    current.text.textContent = s.loading;
    current.focused = activeIn(img) === button;
    img.loading = 'eager';
    const src = img.getAttribute('src')!;
    if (isExpired(src, secondsNow())) {
      tried.delete(src);
      void recover(img, src, mediaPath(src)!);
    } else img.setAttribute('src', src);
  };

  const onError = (e: Event) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    const src = img.getAttribute('src');
    const path = src ? mediaPath(src) : null;
    if (src && path) void recover(img, src, path);
  };

  const onLoad = (e: Event) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    const current = notices.get(img);
    if (!current) return;
    notices.delete(img);
    current.box.remove();
    img.removeAttribute(FAILED);
    img.style.display = current.display;
    if (current.focused && img.tabIndex >= 0) img.focus({ preventScroll: true });
  };

  root.addEventListener('error', onError, true);
  root.addEventListener('load', onLoad, true);
  return () => {
    root.removeEventListener('error', onError, true);
    root.removeEventListener('load', onLoad, true);
  };
}

/** The signed images not loaded yet (lazy ones further down), with their links: a failed one has its notice already. */
function waiting(root: ParentNode) {
  return [...root.querySelectorAll('img')].flatMap((img) => {
    const src = img.getAttribute('src');
    const e = src ? mediaExpiry(src) : null;
    return src && e !== null && !loaded(img) && !img.hasAttribute(FAILED)
      ? [{ src, e, path: mediaPath(src)! }]
      : [];
  });
}

/**
 * Before the links of the images not loaded yet expire, and when the page comes back into view, they are signed again
 * in silence: each link once, so a renewal that brings nothing is not asked for again.
 */
function planRenewals(root: Element | ShadowRoot, renew: RenewMedia) {
  const doc = root instanceof ShadowRoot ? root.host.ownerDocument : root.ownerDocument;
  const asked = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  // Also after a renewal that was on its way when the page went: nothing is planned for what is no longer watched.
  const plan = () => {
    clearTimeout(timer);
    if (stopped) return;
    const ends = waiting(root)
      .filter((w) => !asked.has(w.src))
      .map((w) => w.e);
    if (!ends.length) return;
    timer = setTimeout(() => void refresh(), untilRenewal(Math.min(...ends)));
  };

  const refresh = async () => {
    if (doc.visibilityState === 'hidden') return;
    const before = secondsNow() + RENEW_BEFORE_SEC;
    const due = waiting(root).filter((w) => w.e < before && !asked.has(w.src));
    for (const w of due) asked.add(w.src);
    const paths = [...new Set(due.map((w) => w.path))];
    const found = await Promise.all(paths.map((p) => renew(p, before).catch(() => none)));
    for (const fresh of found) patchMedia(root, fresh);
    plan();
  };

  const onVisible = () => {
    if (doc.visibilityState === 'visible') void refresh();
  };
  doc.addEventListener('visibilitychange', onVisible);
  plan();
  return {
    plan,
    stop: () => {
      stopped = true;
      clearTimeout(timer);
      doc.removeEventListener('visibilitychange', onVisible);
    },
  };
}

/** Watches the images inside `root` (an element or a Shadow DOM); `plan` again after its content changes. */
export function watchMedia(root: Element | ShadowRoot, renew: RenewMedia) {
  const stopFailures = watchFailures(root, renew);
  const renewals = planRenewals(root, renew);
  return {
    plan: renewals.plan,
    stop: () => {
      stopFailures();
      renewals.stop();
    },
  };
}
