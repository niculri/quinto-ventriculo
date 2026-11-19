// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.

// A side of a card as Anki's reviewer shows it: sanitized, in a Shadow DOM with the note type's CSS on Anki's base
// styles, with occlusions, hint links and tap to zoom.
import { useLayoutEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { initExtras, toggleExtraPanel } from './extras';
import { occlusionSnapshot, setupOcclusion } from './occlusion';
import { ImageViewer } from '../../../shared/ui/ImageViewer';
import type { OpenImage } from '../../../shared/ui/ImageViewer';
import { decksStrings as s } from '../strings';

// Anki's reviewer base styles (reviewer.scss, webview.css, image-occlusion/review.scss). What scrolls stays outside
// the shadow root: Radix's scroll lock only sees an event's host there, and would cancel the scroll.
export const BASE_CSS = `
:host { display: flex; flex-direction: column; flex: 1 0 auto; }
.qv-body {
  flex: 1 0 auto;
  display: flex;
  flex-direction: column;
  overflow-wrap: break-word;
}
.qv-body > .card { flex: 1 0 auto; }
/*
 * Anki's defaults with Anki's weight. The card is <body> there: webview.css gives it the canvas colors
 * with «body» (any .card rule of the note type wins), and reviewer.scss «body.nightMode» on top, which a
 * bare .card rule does not beat («explicit nightMode definition required to override default .card
 * styling»); .card.nightMode does. div:where(…).nightMode weighs the same as body.nightMode.
 */
:where(.qv-body > .card) { background-color: #f5f5f5; color: #020202; }
div:where(.qv-body > .card).nightMode { background-color: #141d21; color: #eaf1f2; }
hr { background-color: #a5a5a5; margin: 1em 0; border: none; height: 1px; }
img { max-width: 100%; max-height: 95vh; cursor: zoom-in; }
li { text-align: start; }
pre { text-align: left; }
button { margin: 1em 0.5em; }
.nightMode .latex { filter: invert(100%); }
#image-occlusion-container {
  position: relative; margin: 0 auto; max-height: calc(95vh - 40px); cursor: zoom-in;
}
#image-occlusion-container img {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%; max-width: unset; max-height: unset;
}
#image-occlusion-canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
`;

export function sanitizeCardInBrowser(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['draggable'],
    FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'input', 'object', 'embed', 'link', 'meta'],
  });
}

interface Props {
  html: string;
  css: string;
  ord: number;
  night: boolean;
  occlusion: boolean;
  label: string;
  focusOnShow?: boolean;
}

export function CardFrame({ html, css, ord, night, occlusion, label, focusOnShow = false }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [zoomed, setZoomed] = useState<OpenImage | null>(null);

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const root = el.shadowRoot ?? el.attachShadow({ mode: 'open' });
    const base = document.createElement('style');
    base.textContent = BASE_CSS;
    const own = document.createElement('style');
    own.textContent = css;
    const body = document.createElement('div');
    body.className = 'qv-body';
    const card = document.createElement('div');
    card.className = ['card', `card${ord + 1}`, ...(night ? ['nightMode', 'night_mode'] : [])].join(
      ' ',
    );
    card.innerHTML = sanitizeCardInBrowser(html);
    body.append(card);
    root.replaceChildren(base, own, body);
    initExtras(card);

    // The template's onclick does not survive the sanitizing: the extras buttons, «hint» links and «#» links, here.
    const onClick = (e: Event) => {
      const target = e.target as Element | null;
      if (toggleExtraPanel(target)) return;
      const link = target?.closest?.('a');
      if (!link) {
        const image = zoomable(root, target);
        if (image) setZoomed(image);
        return;
      }
      if (link.getAttribute('href') !== '#') return;
      e.preventDefault();
      if (link.classList.contains('hint')) {
        const next = link.nextElementSibling;
        if (next instanceof HTMLElement && next.classList.contains('hint')) {
          link.style.display = 'none';
          next.style.display = 'block';
        }
      }
    };
    root.addEventListener('click', onClick);
    const active = document.activeElement;
    if (
      focusOnShow &&
      (!active || active === document.body) &&
      !document.querySelector('[role="dialog"]')
    ) {
      el.closest<HTMLElement>('[role="region"]')?.focus({ preventScroll: true });
    }
    const cleanup = occlusion ? setupOcclusion(root) : () => {};
    return () => {
      root.removeEventListener('click', onClick);
      cleanup();
    };
  }, [html, css, ord, night, occlusion, focusOnShow]);

  // `.qv-frame` plays Anki's window: it does not scroll and contains the card's `position: fixed` footer, while the
  // card scrolls inside `.qv-scroll`.
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={-1}
      className="qv-frame relative h-full outline-none"
      style={{ contain: 'layout paint' }}
    >
      <div className="qv-scroll flex h-full flex-col overflow-y-auto overscroll-contain">
        <div ref={host} className="qv-card" />
      </div>
      <ImageViewer image={zoomed} onClose={() => setZoomed(null)} />
    </div>
  );
}

function zoomable(root: ShadowRoot, target: Element | null): OpenImage | null {
  if (target?.closest('#image-occlusion-container')) {
    const src = occlusionSnapshot(root);
    const alt = root.querySelector<HTMLImageElement>('#image-occlusion-container img')?.alt;
    return src ? { src, alt: alt || s.frame.image, caption: '' } : null;
  }
  const img = target?.closest('img');
  if (!(img instanceof HTMLImageElement)) return null;
  return { src: img.currentSrc || img.src, alt: img.alt || s.frame.image, caption: '' };
}

export function cardShadowRoot(region: Element): ShadowRoot | null {
  return region.querySelector('.qv-card')?.shadowRoot ?? null;
}
